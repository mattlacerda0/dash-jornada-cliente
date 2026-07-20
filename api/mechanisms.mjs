import handler from "../netlify/functions/mechanisms.mjs";
import { sendResponse } from "./_adapter.mjs";

export default async function mechanisms(_req, res) {
  return sendResponse(handler, res);
}
