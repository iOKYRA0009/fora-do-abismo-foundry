/** User input is incomplete; this is not a runtime or integration failure. */
export class JarvisInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "JarvisInputError";
    this.code = "JARVIS_INPUT_REQUIRED";
  }
}
