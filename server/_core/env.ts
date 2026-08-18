export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Email address that is granted the "admin" role on account creation.
  ownerEmail: process.env.OWNER_EMAIL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
