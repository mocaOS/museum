import { joinURL } from "ufo";
import { encodeURL } from "js-base64";
import config from "@local/config";
import { createOperationsGenerator } from "#image";

const operationsGenerator = createOperationsGenerator({
  keyMap: {
    resize: "rs",
    size: "s",
    fit: "rt",
    width: "w",
    height: "h",
    dpr: "dpr",
    enlarge: "el",
    extend: "ex",
    gravity: "g",
    crop: "c",
    padding: "pd",
    trim: "t",
    rotate: "rot",
    quality: "q",
    maxBytes: "mb",
    background: "bg",
    backgroundAlpha: "bga",
    blur: "bl",
    sharpen: "sh",
    watermark: "wm",
    preset: "pr",
    cacheBuster: "cb",
    stripMetadata: "sm",
    stripColorProfile: "scp",
    autoRotate: "ar",
    filename: "fn",
    format: "f",
  },
  formatter: (key, value) => `${key}:${value}`,
});

function urlSafeBase64(string) {
  if (string.startsWith("/")) {
    if (string.includes("/uploads/")) {
      string = joinURL(config.api.external_url || config.api.url, string);
    } else {
      string = joinURL(config.website.external_url || config.website.url, string);
    }
  }

  return encodeURL(string);
}

const defaultModifiers = {
  fit: "fill",
  width: 0,
  height: 0,
  gravity: "ce",
  enlarge: 1,
  format: "webp",
  quality: 70,
};

export function getImage(src, { modifiers, baseURL } = {}) {
  modifiers = Object.fromEntries(Object.entries(modifiers).filter(([ _, value ]) => value !== undefined));
  const mergedModifiers = { ...defaultModifiers, ...modifiers };
  const encodedUrl = urlSafeBase64(src);
  const path = joinURL("/transformation/", encodedUrl, operationsGenerator(mergedModifiers).replaceAll("/", ","));

  return {
    url: joinURL(baseURL, path),
  };
}
