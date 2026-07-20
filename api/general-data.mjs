import handler from "../netlify/functions/general-data.mjs";
import { sendResponse } from "./_adapter.mjs";

export default async function generalData(_req, res) {
  return sendResponse(handler, res);
}
