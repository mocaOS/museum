import { Buffer } from "node:buffer";
import { createDirectus, createFolder, createItem, readFolders, readItems, rest, staticToken, updateItem, uploadFiles } from "@directus/sdk";
import axios from "axios";
import dotenv from "dotenv";
import { CustomDirectusTypes, Rooms } from "./types";

dotenv.config();

// const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
//   .with(staticToken(process.env.DIRECTUS_API_KEY!))
//   .with(rest());

const client = createDirectus<CustomDirectusTypes>("https://api.moca.qwellco.de")
  .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
  .with(rest());

const axiosClient = axios.create({
  timeout: 30000,
});

interface TheGraphRoom {
  room: {
    id: string;
    title: string;
    series: string;
    slots: number;
    model: string;
    image: string;
    description: string;
    architect: string;
  };
}

interface TheGraphResponse {
  data: {
    rooms: TheGraphRoom[];
  };
}

async function fetchRoomsFromTheGraph(): Promise<TheGraphRoom[]> {
  const query = `{
    rooms(first: 1000) {
      room {
        id
        title
        series
        slots
        model
        image
        description
        architect
      }
    }
  }`;

  console.log("Fetching rooms data from TheGraph...");

  try {
    const response = await axiosClient.post<TheGraphResponse>(
      "https://gateway.thegraph.com/api/subgraphs/id/7tKB2xz9av6YVVJXjKUvegFJQJWE3wH61qTojv81qm94",
      { query },
      {
        headers: {
          "Authorization": `Bearer ${process.env.THEGRAPH_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data?.data?.rooms) {
      console.log(`Found ${response.data.data.rooms.length} rooms`);
      return response.data.data.rooms;
    } else {
      console.error("Invalid response structure:", response.data);
      return [];
    }
  } catch (error) {
    console.error("Error fetching rooms from TheGraph:", error);
    return [];
  }
}

async function downloadIPFSFile(ipfsHash: string): Promise<Buffer | null> {
  try {
    // Use qwellcode.de IPFS gateway
    const url = `https://ipfs.qwellcode.de/ipfs/${ipfsHash}`;
    console.log(`Downloading file from ${url}...`);

    const response = await axiosClient.get(url, {
      responseType: "arraybuffer",
      headers: {
        "Accept": "*/*",
        "User-Agent": "Mozilla/5.0 (compatible; IPFS-downloader)",
      },
    });

    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Error downloading file from IPFS hash ${ipfsHash}:`, error);
    return null;
  }
}

async function getOrCreateFolder(folderName: string, parentFolderId?: string): Promise<string | null> {
  try {
    // Read existing folders
    const folders = await client.request(readFolders({
      filter: {
        name: { _eq: folderName },
        ...(parentFolderId ? { parent: { _eq: parentFolderId } } : { parent: { _null: true } }),
      },
    }));

    if (folders.length > 0) {
      return folders[0].id;
    }

    // Create folder if it doesn't exist
    console.log(`Creating folder: ${folderName}`);
    const newFolder = await client.request(createFolder({
      name: folderName,
      ...(parentFolderId && { parent: parentFolderId }),
    }));

    return newFolder.id;
  } catch (error) {
    console.error(`Error getting or creating folder ${folderName}:`, error);
    return null;
  }
}

async function setupFolderStructure(): Promise<{ imagesFolderId: string | null; modelsFolderId: string | null }> {
  // Create "ROOMs" folder at root level
  const roomsFolderId = await getOrCreateFolder("ROOMs");

  // Create "Images" and "Models" folders inside "ROOMs"
  const imagesFolderId = roomsFolderId ? await getOrCreateFolder("Images", roomsFolderId) : null;
  const modelsFolderId = roomsFolderId ? await getOrCreateFolder("Models", roomsFolderId) : null;

  return { imagesFolderId, modelsFolderId };
}

async function uploadFileToDirectus(fileBuffer: Buffer, filename: string, folderId: string): Promise<string | null> {
  try {
    console.log(`Uploading file: ${filename} to Directus folder: ${folderId}...`);

    // Create FormData with proper structure for Directus
    const formData = new FormData();

    // Determine MIME type based on filename - images are always JPG, models are always GLB
    const mimeType = filename.includes("_image") ? "image/jpeg" : "model/gltf-binary";

    const blob = new Blob([ fileBuffer ], { type: mimeType });

    formData.append("folder", folderId);

    formData.append("file", blob, filename);

    formData.append("title", filename.split(".")[0]);

    const result = await client.request(uploadFiles(formData));

    if (result && result.id) {
      console.log(`Successfully uploaded ${filename} with ID: ${result.id} to folder: ${folderId}`);
      return result.id;
    } else {
      console.error(`Failed to upload ${filename}: No ID returned`);
      return null;
    }
  } catch (error) {
    console.error(`Error uploading file ${filename}:`, error);
    return null;
  }
}

async function findExistingRoom(tokenId: string): Promise<Rooms | null> {
  try {
    const existingRooms = await client.request(readItems("rooms", {
      filter: {
        token_id: { _eq: tokenId },
      },
      limit: 1,
    }));

    return existingRooms.length > 0 ? existingRooms[0] as Rooms : null;
  } catch (error) {
    console.error(`Error finding existing room with token_id ${tokenId}:`, error);
    return null;
  }
}

async function processRoom(roomData: TheGraphRoom, imagesFolderId: string | null, modelsFolderId: string | null): Promise<void> {
  const { room } = roomData;
  console.log(`Processing room: ${room.title} (ID: ${room.id})`);

  // Temporary fix: Override model IPFS hashes for specific rooms
  if (room.id === "123") {
    room.model = "QmauYa6RPuwmssS7ZnSHs1SJyGSAkKVURPQ6pjrVULybS7";
    console.log(`Applied temp fix: Override model for room ${room.id}`);
  }

  if (room.id === "99") {
    room.model = "QmYobQxBbT3dX8HmqpkhMwAwWZD9RJMRSeGBLRaUQfmwQh";
    console.log(`Applied temp fix: Override model for room ${room.id}`);
  }

  if (room.id === "262") {
    room.model = "QmbFxi75AxovNhAcx4TLyntceG1sdZfLBa1199MCencLkr";
    console.log(`Applied temp fix: Override model for room ${room.id}`);
  }

  try {
    // Check if room already exists
    const existingRoom = await findExistingRoom(room.id);

    // Download and upload image file only if needed
    let imageFileId: string | null = null;
    if (room.image && imagesFolderId) {
      // Check if we need to update the image by comparing IPFS hashes
      const shouldUpdateImage = !existingRoom
        || !existingRoom.image
        || !existingRoom.image_hash
        || existingRoom.image_hash !== room.image;

      if (shouldUpdateImage) {
        console.log(`Downloading new image for room ${room.id} (hash: ${room.image.slice(-8)})...`);
        const imageBuffer = await downloadIPFSFile(room.image);
        if (imageBuffer) {
          const imageFilename = `${room.id}_image_${room.image.slice(-8)}.jpg`;
          imageFileId = await uploadFileToDirectus(imageBuffer, imageFilename, imagesFolderId);
        }
      } else {
        // Reuse existing image file
        imageFileId = typeof existingRoom.image === "string" ? existingRoom.image : existingRoom.image?.id || null;
        console.log(`Reusing existing image file for room ${room.id} (same hash: ${room.image.slice(-8)})`);
      }
    }

    // Download and upload model file only if needed
    let modelFileId: string | null = null;
    if (room.model && modelsFolderId) {
      // Check if we need to update the model by comparing IPFS hashes
      const shouldUpdateModel = !existingRoom
        || !existingRoom.model
        || !existingRoom.model_hash
        || existingRoom.model_hash !== room.model;

      if (shouldUpdateModel) {
        console.log(`Downloading new model for room ${room.id} (hash: ${room.model.slice(-8)})...`);
        const modelBuffer = await downloadIPFSFile(room.model);
        if (modelBuffer) {
          const modelFilename = `${room.id}_model_${room.model.slice(-8)}.glb`;
          modelFileId = await uploadFileToDirectus(modelBuffer, modelFilename, modelsFolderId);
        }
      } else {
        // Reuse existing model file
        modelFileId = typeof existingRoom.model === "string" ? existingRoom.model : existingRoom.model?.id || null;
        console.log(`Reusing existing model file for room ${room.id} (same hash: ${room.model.slice(-8)})`);
      }
    }

    // Prepare room data for Directus - include IPFS hashes for future comparisons
    const roomPayload: Partial<Rooms> = {
      token_id: room.id,
      title: room.title,
      series: room.series,
      slots: room.slots,
      description: room.description,
      architect: room.architect,
      image_hash: room.image, // Store the IPFS hash for future comparison
      model_hash: room.model, // Store the IPFS hash for future comparison
      ...(imageFileId && { image: imageFileId }),
      ...(modelFileId && { model: modelFileId }),
    };

    if (existingRoom) {
      // Update existing room
      console.log(`Updating existing room with token_id: ${room.id}`);
      await client.request(updateItem("rooms", existingRoom.id, roomPayload));
      console.log(`Successfully updated room: ${room.title}`);
    } else {
      // Create new room
      console.log(`Creating new room with token_id: ${room.id}`);
      await client.request(createItem("rooms", roomPayload));
      console.log(`Successfully created room: ${room.title}`);
    }

    // Add small delay to avoid overwhelming Directus
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error(`Error processing room ${room.title} (ID: ${room.id}):`, error);
  }
}

async function main() {
  try {
    console.log("Starting TheGraph rooms sync...");

    // Setup folder structure for file uploads
    console.log("Setting up folder structure...");
    const { imagesFolderId, modelsFolderId } = await setupFolderStructure();

    if (!imagesFolderId || !modelsFolderId) {
      console.error("Failed to setup required folder structure. Exiting...");
      process.exitCode = 1;
      return;
    }

    console.log(`Images folder ID: ${imagesFolderId}`);
    console.log(`Models folder ID: ${modelsFolderId}`);

    // Fetch rooms data from TheGraph
    const rooms = await fetchRoomsFromTheGraph();

    if (rooms.length === 0) {
      console.log("No rooms data found. Exiting...");
      return;
    }

    console.log(`Processing ${rooms.length} rooms...`);

    // Process each room
    for (const room of rooms) {
      await processRoom(room, imagesFolderId, modelsFolderId);
    }

    console.log("TheGraph rooms sync completed successfully!");
  } catch (error) {
    console.error("Error during sync:", error);
    process.exitCode = 1;
  }
}

main();
