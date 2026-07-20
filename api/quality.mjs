import handler from "../netlify/functions/quality.mjs";
import { sendResponse } from "./_adapter.mjs";

export default async function quality(_req, res) {
  return sendResponse(handler, res);
}
