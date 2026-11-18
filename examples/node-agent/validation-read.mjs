import { provider } from "./client.mjs";
import { validation, checkValidation, loadValidation } from "./validation-client.mjs";

try {
  await checkValidation();
  const { agentId, requestHash, validatorAddress } = loadValidation();
  const status = await validation.getValidationStatus(requestHash);
  const summary = await validation.getSummary(agentId, [validatorAddress], "");
  console.log("Request:", requestHash);
  console.log("Nominated validator:", status.validatorAddress);
  console.log("Stored response:", status.response.toString(), "(zero alone does not mean pending)");
  console.log("Tag:", status.tag);
  console.log("Answered requests for this agent/validator:", summary.count.toString());
  if (summary.count > 0n) console.log("Average response:", summary.avgResponse.toString());
} finally {
  provider.destroy();
}
