declare module "draco3dgltf" {
  /** WASM decoder/encoder factory (types not shipped upstream). */
  const draco3d: {
    createDecoderModule(): Promise<object>;
    createEncoderModule(): Promise<object>;
  };
  export default draco3d;
}
