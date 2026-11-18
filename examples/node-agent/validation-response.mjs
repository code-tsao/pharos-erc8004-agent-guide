import { keccak256, toUtf8Bytes } from "ethers";
import { provider, walletFromEnv, confirmed } from "./client.mjs";
import { validation, checkValidation, loadValidation } from "./validation-client.mjs";

try {
  await checkValidation();
  const { agentId, requestHash, validatorAddress } = loadValidation();
  const validator = walletFromEnv("VALIDATOR_PRIVATE_KEY");
  const status = await validation.getValidationStatus(requestHash);
  if (validator.address !== validatorAddress || status.validatorAddress !== validator.address || status.agentId !== agentId) {
    throw new Error("This wallet is not the nominated validator for the saved request");
  }
  const response = 100; // Demonstration score; replace with the validator's actual assessment.
  const responseJson = JSON.stringify({
    requestHash, response, description: "Demo response; no independent verification performed",
  });
  const responseURI = "data:application/json;base64," + Buffer.from(responseJson).toString("base64");
  await confirmed(await validation.connect(validator).validationResponse(
    requestHash, response, responseURI, keccak256(toUtf8Bytes(responseJson)), "demo",
  ));
} finally {
  provider.destroy();
}
