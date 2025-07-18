I joined the Museum of Crypto Art (MOCA) as CTO in early 2021. It was when [Colborn Bell](https://twitter.com/co1born) was seperating from his co-founder Pablo Rodriguez-fraile. The new mission was to truly decentralize the museum and I loved that spirit. Back in these days MOCA had few builds in Somnium Space and an incredible community of artists - but no tech stack. We teamed up with [untitled, xyz](https://twitter.com/untitledxyz_) who became the inhouse architect. He created the Agora which would become one of the very first interoperable exhibition spaces of the museum.

[![](https://hackmd.io/_uploads/r14Io4Bch.jpg)](https://hackmd.io/_uploads/r14Io4Bch.jpg)

We started to envision how the future of the museum could look like and released the [MOCA Manifesto](https://manifesto.museumofcryptoart.com/) as the incorporation of a non-profit foundation which would become the new vehicle allowing us to operate the museum on its path towards decentralization. The [governance token](https://www.coingecko.com/en/coins/museum-of-crypto-art) was launched to be partly distributed via airdrop and to patrons who donated art into the museum.

A year later, when we had 2 products live (Multipass + Show) and our flagship product MOCA ROOMs was in the works. Anyone could create their user profile, aggregate artworks into the [MOCA Community Collection](https://app.museumofcryptoart.com/collection/community-collection) and [create multi-player exhibits](https://moca.show) for free. At the time [Fortune did a profile about MOCA](https://www.youtube.com/watch?v=ERU5-nzj7_U) which was cool but our flagship product that would push our vision to the next stage was not there yet. Lemme explain what this leap means for MOCA in my own words.

Also check the MOCA Live Podcast by Max Cohen it's awesome. Get your weekly dose of cryptoart via [Spotify](https://open.spotify.com/show/1Cs41U8Afgp9eUJ57wz7ma) and then we'll dig into the underlying technology.

# [](#Decentralizing-the-Museum-via-ROOMs "Decentralizing-the-Museum-via-ROOMs")Decentralizing the Museum via ROOMs

As of today MOCA ROOMs is fully live and has been plugged into the governance system. MOCA is the first museum that consists of modular architecture which is interoperable by design and can be permissionlesly owned and curated by anyone. More importantly, any community member can distribute their voting power towards their favorite ROOMs to increase the curator's visibility. This [results in a ranking](https://rooms.museumofcryptoart.com/governance) which defines an entrance to exit order for the Museum of Crypto Art.

- Anyone can own and curate their ROOMs onchain
- Community [assign voting power onchain](https://rooms.museumofcryptoart.com/governance) to influence the visibility of any ROOM
- The entire museum is modularly served via API (entrance to exit)
- Engine-agnostic visualization including the art metadata via GLB
- Provenance record for each ROOM with immutable exhibition history

[![](https://hackmd.io/_uploads/B12s47Hcn.jpg)](https://hackmd.io/_uploads/B12s47Hcn.jpg)

The growth of this metaphysical shape is programatically constrained by the auction mechanism of the ROOMs ecosystem. That mechanic was forked from NounsDAO (e.g. max 1 ROOM per day) in early 2022 and ensures an organic extension of the available supply. Various architects have submitted designs to the platform, most of which come with cc0 licence.

MOCA ROOMs provide composable art exhibitions that are user-curated and enable technical builders or even casual content creators to easily embed them into experiences. Anyone can load individual ROOMs from the MOCA APIs in ways that automatically update its state to reflect the latest curation. The video below showcases the dapp and explains how ROOMs can be curated onchain inside the browser to be spawned seamlessly into a virtual world.

The web is becoming more three dimensional and MOCA ROOMs allows anyone to spread culture and stories across all metaverse platforms, graphics engines and AR layers. There will be tons of virtual environments and we need accessible tools that make it easy to fill the vast emptyness not only with AI generated environments but also with user-generated content.

If you don't understand that version, go ahead and let Rick and Morty explain it to you. I found this sales pitch in [Blackcity](https://hyperfy.io/blackcity) it's hilarious! It was created by [Decenttralize](https://twitter.com/decentralize___) one of the architects who already minted ROOMs on the protocol. If you wanna publish ROOMs architecture or sculptures, make sure to [reach out](https://docs.google.com/forms/d/e/1FAIpQLSeOW9lIWNRLCAJ24IA0UMELR6MV_xKfxUU5zPS06l5ss9pCIQ/viewform) and we'll guide you through the onboarding process.

## [](#Bring-MOCA-ROOMs-into-your-APP "Bring-MOCA-ROOMs-into-your-APP")Bring MOCA ROOMs into your APP

Fetch all ROOMs via [https://api.museumofcryptoart.com/oracle/rooms](https://api.museumofcryptoart.com/oracle/rooms) the "model_curated" is the complete glb model. Via [https://api.museumofcryptoart.com/oracle/rooms/123](https://api.museumofcryptoart.com/oracle/rooms/123) you can pull individual ROOMs by id into your app. The API also serves nft metadata and pure architecture.

## [](#Visit-the-MOCA-Archive "Visit-the-MOCA-Archive")Visit the MOCA Archive

You can explore all ROOMs with their current aswell as all previous curations that are immutably stored onchain via our Waybackmachine-style interface. ROOMs are ordered according to the community driven visibility distribution : [https://archive.museumofcryptoart.com/](https://archive.museumofcryptoart.com/)

# [](#MOCA-ROOMs-in-the-Wild "MOCA-ROOMs-in-the-Wild")MOCA ROOMs in the Wild

Below you can find a list of Metaverse platforms or apps that showcase ROOMs to visualize the interoperable nature of the Museum of Crypto Art. I want to highlight Hyperfy in particular as they already have an app live via which any builder can drop any ROOM into their worlds in a way that it automatically updates from our APIs! Learn more about ROOMs in the [MOCA wiki](https://museumofcrypto.notion.site/M-C-ROOMs-now-LIVE-7e5ff2af1d884f0c95e48a9c091152b3).

## [](#Hyperfy "Hyperfy")Hyperfy

[![](https://hackmd.io/_uploads/Hy8mB7r52.jpg)](https://hackmd.io/_uploads/Hy8mB7r52.jpg)

Find tons of worlds that contain MOCA ROOMs on [https://hyperfy.io](https://hyperfy.io) the reason for so many Hyperfy worlds with ROOMs is the ability for any builder to easily spawn them via a few clicks. The team at Hyperfy worked on a custom implementation that reads rooms directly from our APIs.

## [](#Nifty-Island "Nifty-Island")Nifty Island

[![](https://hackmd.io/_uploads/r1aWKB6jp.jpg)](https://hackmd.io/_uploads/r1aWKB6jp.jpg)[![](https://hackmd.io/_uploads/Sy-EYBTop.jpg)](https://hackmd.io/_uploads/Sy-EYBTop.jpg)

Lots of users have started to build in Nifty Island. First MOCA ROOMs have been brought onto the Islands. Make sure to give this [24/7 deathmatch](https://www.niftyisland.com/islands/c12c61c7-238c-49c3-9427-9afa8a2c31a3) map a try. We're currently building adapters that will make ROOMs integration even easier in the near future.

## [](#Upstreet "Upstreet")Upstreet

[![](https://hackmd.io/_uploads/rkPc8mQ66.jpg)](https://hackmd.io/_uploads/rkPc8mQ66.jpg)

[![](https://hackmd.io/_uploads/r11oLmQTT.jpg)](https://hackmd.io/_uploads/r11oLmQTT.jpg)[![](https://hackmd.io/_uploads/ry-iLXm6T.jpg)](https://hackmd.io/_uploads/ry-iLXm6T.jpg)

Upstreet is still in the making but we've started to tinker around with it. It is entirely web based and comes with a consistent world inspired by Snowcrash. We've obtained land deeds [right next to the street](https://adventure.upstreet.ai/creative/?multiplayer=1&range=1#-16,-1606,W) and plan to deploy a rotating selection of community-curated MOCA ROOMs across these plots to ensure that cryptoart is properly sprinkled into this virtual world.

## [](#Substrata "Substrata")Substrata

This footage was recorded on a private [Substrata](https://substrata.info/) server which we've recently started to build. This desktop application enables you to spawn the entire museum using nocode tools.

## [](#VRM-Live-Viewer "VRM-Live-Viewer")VRM Live Viewer

Created with VRM Live Viewer. The software allows you to import VRM avatars and GLB files like ROOMs to record video footage. Download it for free [https://booth.pm/ja/items/1783082](https://booth.pm/ja/items/1783082)

## [](#Monaverse "Monaverse")Monaverse

[![](https://hackmd.io/_uploads/rynCQTDc3.jpg)](https://hackmd.io/_uploads/rynCQTDc3.jpg)

[![](https://hackmd.io/_uploads/S1mZVaw9n.jpg)](https://hackmd.io/_uploads/S1mZVaw9n.jpg)[![](https://hackmd.io/_uploads/Hy-y7av92.jpg)](https://hackmd.io/_uploads/Hy-y7av92.jpg)

We've seen spotted ROOMs implemented in MONA. You can find one of those in the Filecoin Community Center: [https://monaverse.com/spaces/filecoin-community-center](https://monaverse.com/spaces/filecoin-community-center)

## [](#Oncyber "Oncyber")Oncyber

[![](https://hackmd.io/_uploads/HJ_IhLwn2.jpg)](https://hackmd.io/_uploads/HJ_IhLwn2.jpg)

[![](https://hackmd.io/_uploads/H1NeiUDhn.jpg)](https://hackmd.io/_uploads/H1NeiUDhn.jpg)[![](https://hackmd.io/_uploads/r1vgjUvhn.jpg)](https://hackmd.io/_uploads/r1vgjUvhn.jpg)

Anyone can upload MOCA ROOMs to Oncyber via the new world builder. You can explore the world that we created for testing purposes here: [https://oncyber.io/moca-rooms](https://oncyber.io/moca-rooms).

## [](#Webaverse "Webaverse")Webaverse

We launched a Webaverse server some time in 2022 and are waiting for updates. Learn more in the Twitter thread: [https://twitter.com/MuseumofCrypto/status/1563180082201767940](https://twitter.com/MuseumofCrypto/status/1563180082201767940)

## [](#Somnium-Space "Somnium-Space")Somnium Space

[![](https://hackmd.io/_uploads/HkbFQVHqh.jpg)](https://hackmd.io/_uploads/HkbFQVHqh.jpg)

You can explore the museum in the VR and desktop clients at parcel 3402 or directly your web browser using this link [https://somniumspace.com/parcel/3402](https://somniumspace.com/parcel/3402)

## [](#Decentraland "Decentraland")Decentraland

[![](https://hackmd.io/_uploads/S1GYwaDc3.jpg)](https://hackmd.io/_uploads/S1GYwaDc3.jpg)

[![](https://hackmd.io/_uploads/HkCtvTDq3.jpg)](https://hackmd.io/_uploads/HkCtvTDq3.jpg)[![](https://hackmd.io/_uploads/S1lqw6Pqh.jpg)](https://hackmd.io/_uploads/S1lqw6Pqh.jpg)

We've spotted a few MOCA ROOMs in Decentraland. On this parcel are a few experiments going on, make sure to check it out [https://play.decentraland.org/?position=-43%2C47](https://play.decentraland.org/?position=-43%2C47)

## [](#NeosVR "NeosVR")NeosVR

This was recorded from a locally hosted world. It was showcased during Fil Austin 2022. Watch the full presentation via this url [https://www.youtube.com/watch?v=JGqrM93qARU](https://www.youtube.com/watch?v=JGqrM93qARU)

## [](#VRChat "VRChat")VRChat

World is live [https://vrchat.com/home/world/wrld_8c9c48bd-818c-4d1f-b474-2cae0e47ceee](https://vrchat.com/home/world/wrld_8c9c48bd-818c-4d1f-b474-2cae0e47ceee)

## [](#Spatial-VR "Spatial-VR")Spatial VR

[![](https://hackmd.io/_uploads/SknBTLHc2.jpg)](https://hackmd.io/_uploads/SknBTLHc2.jpg)

You can easily drag and drop ROOMs into your Spatial worlds to enhance them with some art exhibition. Check this example [https://www.spatial.io/s/64-Slot-62e299024a19a00001d63d3b](https://www.spatial.io/s/64-Slot-62e299024a19a00001d63d3b)

## [](#PlayLayer-AR- "PlayLayer-AR-")PlayLayer (AR )

[![](https://hackmd.io/_uploads/SJLomvH9h.jpg)](https://hackmd.io/_uploads/SJLomvH9h.jpg)

PlayLayer is an augmented reality app that you can use to spawn MOCA ROOMs into reality. [Download the APP](https://twitter.com/MuseumofCrypto/status/1688960977608355866) and spawn ROOMs into your own surroundings.

## [](#Fortnite "Fortnite")Fortnite

We're exploring integrations into more mainstream gaming. Fort Nite released powerful SDKs for creators so we started to tinker with that. We can see that younger generations are looking for more gamified ways to explore content. So why not playing existing games inside art exhibitions.

## [](#Arium "Arium")Arium

[![](https://hackmd.io/_uploads/ry9ymDS5n.jpg)](https://hackmd.io/_uploads/ry9ymDS5n.jpg)

Sadly Arium Spaces closed their doors. All worlds went offline. We've been working closely with their team and still kinda hope that they're making it back [https://twitter.com/AriumSpaces](https://twitter.com/AriumSpaces)

## [](#Mozilla-Hubs "Mozilla-Hubs")Mozilla Hubs

[![](https://hackmd.io/_uploads/ryvFjIrc2.jpg)](https://hackmd.io/_uploads/ryvFjIrc2.jpg)

[![](https://hackmd.io/_uploads/rkE9SaPqn.jpg)](https://hackmd.io/_uploads/rkE9SaPqn.jpg)[![](https://hackmd.io/_uploads/B1LrsLr93.jpg)](https://hackmd.io/_uploads/B1LrsLr93.jpg)

Mozilla Hubs has been [discontinued in this form](https://hubs.mozilla.com/labs/mozilla-hubs-early-access-release/) and the worlds that we've created are offline. Platforms changing policies this radically demonstrate why you want to curate with MOCA.