import { readFileSync } from "node:fs";
import { Contract, getAddress, keccak256, toUtf8Bytes } from "ethers";
import {
  provider, checkNetwork, IDENTITY_ADDRESS, AGENT_REGISTRY, loadAgent,
} from "./client.mjs";

export const VALIDATION_ADDRESS = "0x45983Ead2B48e69d57689ffdc6AE648482766537";
export const validation = new Contract(VALIDATION_ADDRESS, [
  "function getIdentityRegistry() view returns (address)",
  "function getVersion() pure returns (string)",
  "function validationRequest(address validatorAddress,uint256 agentId,string requestURI,bytes32 requestHash)",
  "function validationResponse(bytes32 requestHash,uint8 response,string responseURI,bytes32 responseHash,string tag)",
  "function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress,uint256 agentId,uint8 response,bytes32 responseHash,string tag,uint256 lastUpdate)",
  "function getSummary(uint256 agentId,address[] validatorAddresses,string tag) view returns (uint64 count,uint8 avgResponse)",
], provider);

export async function checkValidation() {
  await checkNetwork();
  if (await provider.getCode(VALIDATION_ADDRESS) === "0x") throw new Error("Validation registry is missing");
  if (await validation.getIdentityRegistry() !== IDENTITY_ADDRESS || await validation.getVersion() !== "2.0.0") {
    throw new Error("Validation registry linkage or version changed");
  }
}

export function loadValidation() {
  const { agentId } = loadAgent();
  const record = JSON.parse(readFileSync("validation.json", "utf8"));
  const request = JSON.parse(record.requestJson);
  if (record.validationRegistry !== VALIDATION_ADDRESS || request.agentRegistry !== AGENT_REGISTRY ||
      BigInt(request.agentId) !== agentId || keccak256(toUtf8Bytes(record.requestJson)) !== record.requestHash) {
    throw new Error("Validation record belongs to a different agent/registry or its bytes changed");
  }
  return {
    agentId, requestHash: record.requestHash,
    validatorAddress: getAddress(request.validatorAddress),
    requestURI: "data:application/json;base64," + Buffer.from(record.requestJson).toString("base64"),
  };
}
