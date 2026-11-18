import { existsSync, writeFileSync } from "node:fs";
import { getAddress, hexlify, randomBytes, keccak256, toUtf8Bytes, ZeroAddress } from "ethers";
import { provider, walletFromEnv, confirmed, loadAgent, AGENT_REGISTRY } from "./client.mjs";
import { validation, VALIDATION_ADDRESS, checkValidation, loadValidation } from "./validation-client.mjs";

try {
  if (existsSync("validation.json")) throw new Error("validation.json already exists; inspect its request before creating another");
  await checkValidation();
  const { agentId } = loadAgent();
  const owner = walletFromEnv("OWNER_PRIVATE_KEY");
  const validatorAddress = getAddress(process.env.VALIDATOR_ADDRESS);
  if (validatorAddress === ZeroAddress || validatorAddress === owner.address) {
    throw new Error("Choose a separate, nonzero validator address for this demo");
  }
  const requestJson = JSON.stringify({
    agentRegistry: AGENT_REGISTRY, agentId: agentId.toString(), validatorAddress,
    nonce: hexlify(randomBytes(32)), task: "Demonstrate the validation request/result flow",
  });
  const requestHash = keccak256(toUtf8Bytes(requestJson));
  // Save the exact bytes and hash before any transaction is sent.
  writeFileSync("validation.json", JSON.stringify({
    validationRegistry: VALIDATION_ADDRESS, requestHash, requestJson,
  }, null, 2) + "\n", { flag: "wx" });
  console.log("Saved request:", requestHash);
  const { requestURI } = loadValidation();
  await confirmed(await validation.connect(owner).validationRequest(
    validatorAddress, agentId, requestURI, requestHash,
  ));
} finally {
  provider.destroy();
}
