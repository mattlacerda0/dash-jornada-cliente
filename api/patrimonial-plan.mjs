import handler from "../netlify/functions/patrimonial-plan.mjs";
import { sendResponse } from "./_adapter.mjs";

export default async function patrimonialPlan(_req, res) {
  return sendResponse(handler, res);
}
