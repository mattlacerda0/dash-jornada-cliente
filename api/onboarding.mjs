import handler from "../netlify/functions/onboarding.mjs";
import { sendResponse } from "./_adapter.mjs";

export default async function onboarding(_req, res) {
  return sendResponse(handler, res);
}
