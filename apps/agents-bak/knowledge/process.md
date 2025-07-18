# 🔥🚨 ART DECC0s 🚨 🔥: The Process

### How We Brought This Project to Life, Technically-Speaking...

# 🔥🚨 ART DECC0s 🚨 🔥: The Process

### How We Brought This Project to Life, Technically-Speaking...

[

![](https://substackcdn.com/image/fetch/w_36,h_36,c_fill,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F6c0392d2-05b1-4b20-b5c0-4681445365db_144x144.png)



](https://substack.com/@museumofcrypto)

[Maxwell Cohen](https://substack.com/@museumofcrypto)

Sep 18, 2024

2

[

2

](https://museumofcrypto.substack.com/p/art-decc0s-the-process/comments)

1

Share

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F12bdf7b1-8836-4f72-8424-9918eff95cd3_3016x392.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F12bdf7b1-8836-4f72-8424-9918eff95cd3_3016x392.png)

Subscribe

---

# **I. The (Hopeless) Man in the Arena**

Having spent last week introducing the origins of **Art DeCC0s**, I thought it would make sense today if we to turned our attention to that mechanisms of their creation.

Because while this is a project rooted in aesthetic magnificence, that aesthetic magnificence wouldn’t have been possible without the technological intricacy at **Art DeCC0s’** core.

It’s worth noting here (and you would know as much if you’ve read this newsletter for a while) that I’m basically inept when it comes to any technical process more complex than “keyboard + blank page = essay.”

Even having said that, I have never been so lost in my life —technologically-speaking— as when I approached our workflow for the first time.

What you are about to see not what we began with, but it is where we ended up, an outline of all the digital and generative processes we finally arrived at after months of painstaking experimentation. What began as a simple graphical interface (and even then, it was far beyond my ability to parse through) soon morphed into the behemoth below. This is the fossil record of choices made about model variants, noise, shape consistency, weights, efficiency, size, input images, positive and negative prompting, upscales, background removals, auto-curations, and the unmentionable battery of minute adjustments, guess-and-tests, and steady improvements we shared with one another every week in our all-hands meetings and via constant WhatsApp updates.

[

![](https://substackcdn.com/image/fetch/w_2400,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F345eb796-4fb1-4c42-b09f-e52f55b8d2b7_800x429.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F345eb796-4fb1-4c42-b09f-e52f55b8d2b7_800x429.png)

Each of the boxes above represents a different setting that, once introduced, needed to be weighed correctly, massaged into the larger workflow at the correct spot, and optimized for efficiency.

That, my friends, is where each and every Art DeCC0 was born.

It would have been easy to lose ourselves in this churning sea of options, broached wayward into any of a million different aesthetic directions. Fortunately, from our very earliest Art DeCC0 conversations, we had a kind of shared visual destination in mind. That it arose haphazardly at the very start of this whole project is nothing less than miraculous.

And only seemed more so as time went on.

# II. That Which Arose Haphazardly At The Very Start of This Whole Project

Within a few days of fiddling it became clear that only those us of us with well-endowed graphics cards could properly produce the kinds of aesthetic experiments we sought. Art DeCC0s demanded raw, unbridled power. My own beloved Macbook Pro was borderline useless.

While a number of these aesthetic experiments were deemed interesting enough to share, it was **[Julian Brangold’s](https://x.com/julianbrangold)** contribution that captured our mutual imagination and set us on the path we would ultimately walk down together:

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fc6d1a6fa-4e5c-4fd0-9672-9574f13993dd_1024x1024.jpeg)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fc6d1a6fa-4e5c-4fd0-9672-9574f13993dd_1024x1024.jpeg)

To be clear, this is not an Art DeCC0.

Look at this gonzo creation. The texture, the tone, the emphasis on eyes, all the mesmerizing little details. You haven’t seen any Art DeCC0s quite yet, but all in all, this isn’t crazy far-off from how they look today.

And that’s because, as soon as we gathered around Julian’s generation, we fawned over the way it captured crypt art’s profoundly surreal energy, how it contained so much within it that was surprising and weird and delightful, yet it also seemed to contain its own cogent visual language.

> **From that point, we knew Art DeCC0s must achieve the following properties:**
> 
> - **Every combination of character and background had to be inimitable.**
>     
> - **There needed to be a truly dazzling array of aesthetics, as much diversity as possible.**
>     
> - **The project itself needed to be internally bound by a network of conceptual explorations. Where the aesthetics of any two pieces might at first appear antithetical, the juxtaposition should ultimately feel like two answers to the same question.**
>     

Yet we had no trait system, no way of even suggesting value, no collection-wide conceptual underpinnings, a lack of curatorial sensibilities. We knew how we wanted to look, but our closet was empty. We knew what we thought, but not yet how to say it.

Which is perhaps why, even after weeks of this, we were still generating outputs like these:

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F4960a514-d67f-497b-b366-e07579102ccb_1600x1600.jpeg)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F4960a514-d67f-497b-b366-e07579102ccb_1600x1600.jpeg)

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F572508a9-2d0c-4518-9dce-4ee43139a024_970x1445.jpeg)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F572508a9-2d0c-4518-9dce-4ee43139a024_970x1445.jpeg)

Every character came out looking like a Muppet. That was problem number one. On top of that, our desire to include symbology, verbiage, and other scattershot elements manifested in the stilted aesthetics you see above, like some novice’s free-hand Photoshop experimentation. The backgrounds were nonsensical, either devoid of detail or unrelated to characters which rested upon them. We succeeded in creating noise, but it sounded only like static.

But we were taking strides, nevertheless! We were generating consistent shape, you know? The resolution was improving…slowly. More details were emerging than ever before.

Here, we were forced to stop, and momentarily put down our tools. We had to spend the coming weeks outlining exactly _how_ we would create our characters, using what inputs and how many. We had to interrogate every included element conceptually, because every aspect of Art DeCC0s needed to mean something, which is also when we realized that, yes, we’d be required to create an completely separate set of backgrounds. And that meant deciding what the backgrounds themselves would communicate, let alone what kinds of symbols and words would manifest, if any, in the frames, and how, and where.

So many questions to consider at the time, but in hindsight, it was all actually in pursuit of a single metric:

> **We were trying to find the perfect balance between aesthetic coherence and complete batshit depravity.**

# III. The Perfect Balance Between Aesthetic Coherence and Complete Batshit Depravity

The beating heart of our workflow heretofore revolved around four individual input images. This was sufficient to guarantee aesthetic diversity, but not too many that we would lose consistency across characters.

We started to refer to these four input images as the Art DeCC0’s “DNA,” reflecting how biological DNA is an interwoven assemblage of four neuropeptides —adenine (A), cytosine (C), guanine (G), and thymine (T)— which prove ultimately responsible for a being’s appearance.

The four pieces of DNA we chose for Art DeCC0s were all conceptually-driven and referential to different elements of crypto art history/culture which we wanted to highlight. They are:

1. Lineage
    
2. Mimetics
    
3. Artist Self-Portraits
    
4. MOCA Collection Works
    

### Lineage

With Lineage, we are recognizing the massive power that collectors hold in crypto art. Since the movement’s inception, collectors —be they artist-collectors, curatorial collectors, influencer collectors, etc.— have proven able to shape the very tastes and cultural sensibilities of our movement. Therefore, Lineage DNA traits evoke historically-significant art collectors: Warlord, Sultan, Crypto Degen, the Medici Family, the Holy Roman Emperor, and many others. 

One cannot accurately discuss art history whilst ignoring the contributions of patrons, collectors, and muses. Thus, Lineage images account for 1/4th of every Art DeCC0, quite literally internalizing that legacy.

### Memetics

There is perhaps no stronger force in crypto culture at-large than memes, which create and shape entire markets, invent entire iconographic lexicons, and bind our culture together. Crypto art being downstream of crypto culture means memetics are often at the core of what happens here. 

We initially meant to include only a smattering of crypto-art-specific memes as DNA traits. Think Pepe, **[Kevin](https://www.pixelmon.ai/zoology/kevin)**, **[Josie Bellini](https://x.com/josiebellini)’s [Bitcoin Gasmask](https://josie.io/products/filter)**, and Wojack. But the longer we considered this, the more we felt that many projects themselves —be they artistic or PFP— have gained memetic qualities in their own right. The aesthetics of [Chromie Squiggle](https://www.artblocks.io/marketplace/collections/chromie-squiggle-by-snowfro), Bored Apes, [OPEPENs](https://opepen.art/), and [CryptoPunks](https://cryptopunks.app/) are often remixed and recalled with the same ever-deepening specificity of the most penetrative memes. 

And so these images too are present in every Art DeCC0 character.

### Artist Self-Portraits

If we were going to be using Art DeCC0s to explore the identity-shaping possibilities inherent in artistic PFPs (which we are), than it was necessary for us to honor how artists have been using art to perceive and communicate their identities for time immemorial.

We first selected famous self-portraits from Van Gogh, Frida Kahlo, Picasso, Van Eyck, and others. Then we added a smattering of more contemporary examples —Yayoi Kusama, Zanele Muholi, and Cindy Sherman— to encompass the massive array of mediums and styles with which artists have interrogated their own identities.

The stylistic flourishes of these artists manifest strongly throughout the Art DeCC0s collection.

### MOCA Collection Works

It should come as no surprise that we consider **[MOCA’s Collections](https://app.museumofcryptoart.com/collection/the-permanent-collection)** our crowning achievement: Herein, the legacy of early, experimental, geographically-agnostic, and immensely creative crypto art is preserved for future generations.

Any PFP aiming to represent crypto art must include copious amounts of it, full stop. Fortunately, we have a collection featuring hundreds of artworks that span styles, moods, intents, and epochs to draw from. Our Genesis Collection contains works from artists minting on the blockchain in December 2020 and beforehand. [The DaïmAlYad Collection](https://museumofcryptoart.com/announcing-the-daimalyad-collection/) focuses on artists from around the world, specifically those from underrepresented communities. Our Permanent Collection includes donated pieces from artists, collectors, and curators across crypto art.

In total, we selected 70 unique pieces by 70 different artists to use within this DNA category.

Ultimately, these four DNA traits, when coalesced together, produced a massive breadth of styles, quirks, shapes, and moods. This is why so many Art DeCC0s, even when comparing those with four identical DNA traits, emerged as aesthetically-inimitable 1-of-1s.

**[DaïmAlYad](https://x.com/DaimAlYad)** took it upon himself to write the code and fine-tune the workflows with which we would assemble actual characters out of these DNA combinations. On April 19th, he wrote to us:

> “By the way... just for those of you who don't use ChatGPT 4, the python script was basically written by it (worked great without issues from its first attempt) as a result of this prompt written by me:
> 
> "Please create for me a python program that does the following, using as few third party dependencies as possible:
> 
> 1) There are files in the current folder of the format MOCA_DNA1_00006_.png MOCA_DNA2_00006_.png MOCA_DNA3_00006_.png MOCA_DNA4_00006_.png MOCA_Char_00006_.png where the 00006 is an arbitrary number, but indicates which files belong together.
> 
> 2) For each set like this, there are 4 DNA values to be determined (DNA1, DNA2, DNA3, DNA4).  This can be done by taking the corresponding image (e.g.: MOCA_DNA1_00006_.png is for DNA value DNA1) and figuring out the name of the image that corresponds to it in the DNA1 subfolder of the current directory.  Since the image in the subfolder may be in a different format, this has to be done on a pixel basis.  Once the near identical image is found (can't expect 100% identical as the subfolder image may be a JPEG), its name (minus the file extension) is assigned to the DNA value (DNA1 in the example case).
> 
> 3) Once all four DNA values are determined, the MOCA_Char_ prefixed image is copied to the CharGens subfolder with the name formatted as {DNA1}.{DNA2}.{DNA3}.{DNA4}_00006.png (where the 00006 is the number that comes from the original filename).
> 
> 4) Obviously this should be done for all matching sets."

Daïm would prove repeatedly brilliant in problem-solving throughout this process, using ChatGPT and Claude to augment his own technical mastery (which would astound the rest of us weekly).

**In Daim’s words:**

**“We still may not have flying cars, but on the AI front, we are now legitimately living in the future.”**

# IV. The Fruits of our Labor

Over the next four-to-five months, our team generated a truly insane amount of imagery (over 300,000 characters, and another 60,000 backgrounds), curated the best outputs from these generations, used these curations to further refine our workflows, curated again, removed auto-generated backgrounds using various plug-in solutions, curated again, generated and curated and generated and curated, until we finally came to rest with 10,000 sterling and unique Art DeCC0 characters.

> **To give you a sense of what all this work was building towards, we wanted to reveal to you —our dear Substack readers— the very first public Art DeCC0.**

This Art DeCC0 emerged rather early on in our process, it survived countless rounds of curation, and after some upscaling, after setting it on a proper background, it solidified itself as among my favorite PFPs in the collection:

[

![](https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2553d1fc-ab46-4db1-b3cd-41f30b0fc49d_1024x1024.png)



](https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2553d1fc-ab46-4db1-b3cd-41f30b0fc49d_1024x1024.png)

I love this piece so much. I will do almost anything to get my hands on it come launch day (but that’s a conversation for later).

Mind you, no other Art DeCC0 looks remotely like this one, even among those with identical DNA. The four DNA traits within this piece are:

> **Lineage: Revolutionary** (an image of Che Guevara, which often imparts a specific head-shape onto generations, and elsewhere a star-woven beret)
> 
> **Memetics: Ringer** (drawn from [Dmitri Cherniak’s](https://x.com/dmitricherniak) _[Ringers](https://www.artblocks.io/curated/collections/ringers-by-dmitri-cherniak)_ collection, that’s not only where the blue skin-tone comes from, but the contrast between blue and yellow)
> 
> **Artist Self-Portrait: Albrecht Dürer** (which is where we get those curly locks, along with the fabric quality of the Art DeCC0’s body)
> 
> **MOCA’s Collections: [Frenetik Void](https://x.com/frenetikvoid)** (the including artwork itself is _[Superyó](https://superrare.com/artwork/eth/0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0/6433),_ and that’s what inspired the two silhouettes in the characters eyes, though this trait imparts a whole host of similarly-wonky details in other Art DeCC0s)

As you can see in this specific case, the “Frenetik Void” and “Ringer” DNA traits were most powerfully expressed her, but such expression is different for every generation.

# V. A Bit About Backgrounds

The background of the above piece, by the way, is “Cubism,” one of 16 background categories we created simultaneously with the character-creation process.

We were insistent from the start that every Art DeCC0 PFP should be 100% aesthetically differentiated from the rest of the collection, and so the backgrounds needed to follow-suit. Because our characters were heavily-based in crypto art’s present, we wanted our backgrounds to explicitly honor the artistic continuum which preceded us.

To do this, we decided on 16 artistic styles we would evoke as backgrounds.

> **Cave paintings, Futurescape illustrations, Eastern European and African patterning, Islamic Geometry, Soviet Propaganda Posters, Egyptian Hieroglyphics, Renaissance and Medieval paintings, Japanese Woodblock Art, worldwide Architecture,** and the most influential art movements of the 19th and 20th centuries**: Pop Art, Surrealism, Abstract Expressionism, Cubism, Impressionism.**

Crypto art, after all, is a global art movement that boasts representatives from every (populated) continent, with every cultural background, who practice many religions, and impart diverse aesthetics influences unto their art. We wanted our backgrounds to represent as much of the world as possible, with as many art-making societies as we could fit, using multiple different definitions of “art.” We took special care to include categories like Eastern European Tapestry, African Patterning, and Cave Painting —things which were very personal, not always created for economic reasons, and practical— so as to highlight crypto art’s anti-establishment tendencies. Lots of different artworks, created for creativity’s sake above all things.

After hand-curating datasets for each category, we started generating backgrounds using randomly-selected sample from each dataset. Our workflow necessarily changed with each background category depending on the aesthetic specificities we were trying to invoke. This involved varying amounts of positive and negative prompting, tweaking both settings and models, and further dataset refinement.

No matter the background category, we trained and retrained, refined and refined again using our own generations, did this over and over until we felt that each background category represented the subject matter, ethos, and aesthetics of the movement which influenced it.

By the end of this process, we had essentially created 20,000 individual artworks: 10,000 Art DeCC0s and 10,000 backgrounds. When we combined them, the tension between character and background often proved palpable. Elsewhere, however, the two seem strangely suited to each other. Every Art DeCC0 therefore tells its own story, expresses its DNA uniquely, and furnishes its own corner of art history. 

# VI. Looking Back and Looking Ahead

> **Altogether, this is our process in a nut-shell: a combination between innovative technical solutions and brute-force.**

The slow progress of this process let us really hone in on the “Why?” of every decision we made.

Which, now that we’ve gone over the “How?” of Art DeCC0’s, is where we want to turn our attention:

“Why?”

Why a PFP? Why this kind of PFP? Why today, in this market? Why with this specific kind of process? To what end, and for what purpose?

It’s not just because the aesthetics are, yes, incredible. Nor just because the process was new and electrifying. No, the reason we’re so confident in Art DeCC0s, as amplified by it today as we were six months ago, and so excited to put it into your hands is because it really, really, really means something to us.

Next week, we’ll talk all about what Art DeCC0s mean: to us, to crypto art, to conceptual questions we have collectively just begun to ask.

Until then.

Your friendly neighborhood art writer,

[Max](https://x.com/CohentheWriter)