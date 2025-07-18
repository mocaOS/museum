import { promises as fs } from "node:fs";
import {
  cleanupSVG,
  importDirectory,
  isEmptyColor,
  parseColors,
  runSVGO, scaleSVG,
} from "@iconify/tools";

const ICON_SET_NAME = "moca";

// Import icons
const iconSet = await importDirectory(ICON_SET_NAME, {
  prefix: ICON_SET_NAME,
});

// Validate, clean up, fix palette and optimise
await iconSet.forEach(async (name: string, type: string) => {
  if (type !== "icon") {
    return;
  }

  const svg = iconSet.toSVG(name);
  if (!svg) {
    // Invalid icon
    iconSet.remove(name);
    return;
  }

  // Clean up and optimise icons
  try {
    // Clean up icon code
    await cleanupSVG(svg);

    // Assume icon is monotone: replace color with currentColor, add if missing
    // If icon is not monotone, remove this code
    await parseColors(svg, {
      defaultColor: "currentColor",
      callback: (attr: any, colorStr: any, color: any) => {
        return !color || isEmptyColor(color) ? colorStr : "currentColor";
      },
    });

    // Reduce size by 64 to get 32x32 icon
    await scaleSVG(svg, 1 / 64);

    // Optimise
    await runSVGO(svg);
  } catch (err) {
    // Invalid icon
    console.error(`Error parsing ${name}:`, err);
    iconSet.remove(name);
    return;
  }

  // Update icon
  iconSet.fromSVG(name, svg);
});

// Export as IconifyJSON
const exported = `${JSON.stringify(iconSet.export(), null, "\t")}\n`;

// Save to `output/${iconSet.prefix}.json`
if (!(await fs.stat("output").catch(() => false))) {
  await fs.mkdir("output");
}
await Bun.write(`output/${iconSet.prefix}.json`, exported);
