import TransformIn from "@transform-in/sdk";

const transformIn = new TransformIn({
  // base_url: "https://media.qwellcode.de/api",
  project_id: "512a5333-37b0-4cb9-9c28-847676421c39",
  api_key: "5e2546a8-831a-4b8e-ae12-3f2ec119b76e",
});

const defaultModifiers = {
  width: 0,
  height: 0,
  f: "webp",
  q: 70,
};

export function getImage(src, { modifiers, baseURL } = {}) {
  modifiers = Object.fromEntries(Object.entries(modifiers).filter(([ _, value ]) => value !== undefined));
  const mergedModifiers = { ...defaultModifiers, ...modifiers };

  // remove every query param from src
  const cleanSrc = src.split("?")[0];

  const path = transformIn.url(cleanSrc, mergedModifiers);

  return {
    url: path,
  };
}
