import handler from "../netlify/functions/meetings.mjs";
import { sendResponse } from "./_adapter.mjs";

export default async function meetings(_req, res) {
  return sendResponse(handler, res);
}
