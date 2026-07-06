### ***What a 4-channel image taught me about memory***
---

Yesterday, I felt like using NumPy to transpose an image array and plot it to see if the changes are always noticable. It was just a very convincing thought, and I definitely went by it. 

I found a png image upon google search - a picture of tulips.  I loaded it into a notebook expecting the same old result: 3-channel RGB array. But what I got was this instead:  
    `Image shape: (609, 474, 4), dtype: uint8, min: 0, max: 255`

4 channels? I hadn't seen or atleast noticed it ever before. And that 4th channel turned out to be my doorway into strides, cache lines and much more.  

---

This is my first post in the series where I try to learn the low-level, kernel-adjacent parts of ML systems. It's the stuff that doesn't show up in any "build neural networks" tutorial, but is rather learned by poking at small, seemingly dumb and unglamorous things, until they all start making quite sense.  

Now, coming back to the curiousity sparked by that suspicious 4th channel. I had a few questions, and kudos, I found the answers to them all. Read along to know.  

#### **1. What even is that 4th channel?**

`img.shape` said `(609, 474, 4)` representing H (height), W(width) and 4 channels. Pulling the top-pixel confirmed it:  
        `pix0_0 = arr[0, 0] # Pixel (0, 0) = [ 70 147 191 255 ]`

I checked for min, max values for all the 4 channels individually. The 4th channel suspiciously had a constant value of 255 throughout the whole image. 

It is the `alpha channel` - represents transparency. Such images are called RGBA. PNGs support it, JPEGs don't, and since this one had zero actual transparency (alpha is 255 everywhere - opaque), it was dead weight.  

Easy, right? The alpha channel isn't used in the image, so I could safely slice off. Or so, as I thought.  
        `rgb_arr = arr[:, :, 3]` 
This is where the real lesson began. I had known that slicing an array returns a view, not a copy, but I had never understood the implications of doing it. You need just a part of an array, we slice and move on, right? Ever wondered what is actually happening during the "memory fetch"?  

Slicing off alpha channel doesn't give you a "clean" RGB array - it gives a `view` into the original RGBA memory with a chunk from ever pixel amputated. NumPy doesn't repack anything; it just changes what we'll be allowed to see.  

Confused? Checking the strides makes this obvious:  
        `print(rgb_arr.strides) # Original RGB array strides: (1896, 4, 1)`  
Strides are simply steps. It tells us *how many bytes would I need to skip, to move one step along this axis?* Keep in mind the dtype is unit8, meaning to store each value in memory, it takes eaxctly 1 byte space. Observe the output above now:  

    - the channel stride is 1 => each channel value is 1 byte
    - the height channel stride, meaning the stride to jump down to the next row is 1896. Here the stride would be one row long = 474*4.
    - the stride to jump to the next pixel (move 1 pixel along the width) is again 4.
Weird right? If the array were genuinely a packed 3-channel block now, this number would have been 3. Even though we sliced off the alpha byte, the ghost of it still remains in memory, unskippable.  

Time to be sure, so we do:  
        `print(rgb_arr.flags['C_CONTIGUOUS'])  # False`  
Note that `C_CONTIGUOUS` refers to a memory layout in which the array elements are stored in a single, continuous block of memory. Here, the output being `False` implies that the array is not contiguous.  

The array certainly does look like RGB, but is laid out like (RGBA-1) channel. To make it contiguous, we've got to force NumPy to actually repack it, into a clean block:  
        `img_clean = np.ascontiguousarray(rgb_arr)`  
        `img_clean.strides  # (1422, 3, 1)`
Finally no more jargon. Every byte in the memory is a byte we actually want.

---

The above thing laid the perfect plot for another question I had cared not to pay attention to, ever before.

#### **2. Why do images live as (H, W, C) on disk, but ML frameworks always want them as (C, H, W)?**

A camera sensor scans a scene row-by-row, and at each pixel, it writes RGB together before moving on to the next pixel. So, (H, W, C) is how data naturally arrives. But a convolution applies the same operation independently on an entire channel at a time. For that, we want all reds contiguos, then all greens contiguous, then all blues contiguous - i.e. one long contiguous streach of memory per channel, not every 3rd byte.  

So we transpose it - `img_clean.transpose(2, 0, 1)`. Transposing to `(C, H, W) doesn't move any data, it just relabels axes. You'll notice that the strides now become (1, 3, 1422) - same numbers, different order. It is important to know that taking a transpose gives a view of the original array, the actual "repacking" only happens when something forces a real copy.

---

After I reached this point, I had a new doubt. Maybe it's dumb, but what's the harm in sharing.  

    Transpose also gives a view of the array. But making a copy in the desired format would mean the data could stay contiguous channel-wise, just as we require. But at what cost?
**Transpose vs. copy, which is more CPU work and which is more efficient?**  

My instinct said that the transpose must be quietly making the CPU do more work later, and that copying upfront would make it better. As I researched more, it turned out that's totally backwards.  

Transpose is not work at all. It never touches a single pixel value, just rewrites a handful of shapes and strides and hands back a new view to us, pointing at the same memory. That's why it's almost instant, no matter how big the image/array is. Hence, the real comparison is not *transpose vs copy, which one is cheaper* - transpose is always cheaper. 

But it's interesting to know what happens after and how many times: 

- **we touch the data once**: copying first is undeniably the worst choice here. Making the copy means reading the data once (slow and scattered), writing it out in a contiguous fashion, then reading it again to actually use it. That's two full passes over memory, just for one operation (and we all know memory operations are slow). It's clearly visible that `a single strided pass, cache misses and all`, is usually still cheaper than `strided-read + contiguous-write + contiguous-read`.
- **we touch the data many times**: let's say we have a training loop hitting the same sensor for a 1000 times. Now things have changed. Here, paying the copy cose once would get us a cheaper access forever after. Here it is totally worth it to make a new copy with contiguous data.

It is so interesting. Neither one is a dominant winner, both the methods cater to different requirements. This is exactly why NumPy and PyTorch default to laziness (i.e. no copy happens until some operation actually demands one) - `transpose()` is free and the framework only forces `contiguous()` copy only when it requires it.

    For example: a cuDNN kernel cannot operate on strided memory, so that's the time when the framework knows for sure that the copy will pay off.   

A random side-note `contiguous()` only happens because you (or a library) called some other function on the array. Unlike `transpose()`, where the user calls the usage, there are really two behaviours for `contiguous()`:  

- **silent auto-copy**: some functions detect that the input isn't contiguous, and quietly make a clean copy behind the scenes, run on that, and hand us the result. We never see it happen.
- **loud refusal**: other functions (especially low-level kernels) just error out: "expected contiguous tensor" - now it's on us to call `.contiguous()` ourselves before calling them again.

---

#### **BENCHMARK: what does "non-contiguous" cost, in seconds?**  

Too much of theory? Yepp, I wanted to "see it" as well. I ran `.sum()` 100 times on the transposed (non-contiguous) view vs the version turned contiguous using `ascontiguousarray`:   
    `Non-contiguous time:    0.24412941932678223`  
    `Contiguous time:        0.07428741455078125`

Interesting to notice that same data, same mathematical operations, same result but **3.3x** slower just because of the layout. Nothing is different about the values except for how far apart they sit in the memory (RAM).  

Here's some slight explanation on that: the catch here is that CPU doesn't fetch one byte at a time, it pulls a whole `cache line` (meaning 'n' bits simulataneously). When the memory is contiguous, in one go CPU fetches 'n' bytes and all of them are useful to us. But when it's not (in our case, because of every 4th byte being the skipped alpha value), a chunk of 'n' bytes that it loads in one go is junk. We paid to fetch it, only to immediately discard it. This leads to more cache misses, more trips to CPU (slower), and more wasted bandwidth. 

See, how much of a difference it really makes!

---

#### **This is the whole game in GPU kernels**

Realizing this part is what made this whole digging deep worth more.  
GPU kernels are extremely sensitive to memory access patterns. "Contiguous access beats scattered access" is not a NumPy quirk - it's actually very close to the central design constraint of writing fast CUDA/kernel code. GPUs take the same idea and turn up the dial - it's called `memory coalescing` in GPU programming, where a wrap of threads reading adjacent memory addresses get services in one wide transaction, while the same threads reading scattered addresses fragment into slower ones.  

Many optimized backends (cuDNN etc) either require contiguous input or silently make a hidden copy for us - meaning the extra "cleaning" cost is paid anyway, just invisibly and repeatedly instead of once explicitly.

---

    Layout is never neutral. Two arrays can hold the exact same numbers and differ by 3x in speed, purely because of how they're arranged in memory. A transparent pixel value that's always 255 seemed like the least interesting number in the whole array. It turned out to be the one hiding the entire lesson.

***That's the lesson I move ahead with, from this session. Until next time...***