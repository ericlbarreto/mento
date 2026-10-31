export const TEST_DB = "mento_test_sources";
export function mongoTestUri(): string | undefined {
  if (process.env.MONGO_INT === "0") return undefined;
  if (!process.env.MONGODB_URI) {
    try {
      process.loadEnvFile(new URL("../../../.env", import.meta.url));
    } catch {
      // no .env
    }
  }
  return process.env.MONGODB_URI;
}
