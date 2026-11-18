import { readFileSync } from "node:fs";
import { getAddress } from "ethers";
import {
  checkNetwork, provider, reputation, walletFromEnv, confirmed, loadAgent,
} from "./client.mjs";

try {
  await checkNetwork();
  const { agentId, agentRegistry } = loadAgent();
  const record = JSON.parse(readFileSync("feedback.json", "utf8"));
  const reviewer = walletFromEnv("REVIEWER_PRIVATE_KEY");
  if (record.agentRegistry !== agentRegistry || BigInt(record.agentId) !== agentId ||
      getAddress(record.clientAddress) !== reviewer.address) {
    throw new Error("Use the original reviewer's wallet and matching feedback record");
  }
  await confirmed(await reputation.connect(reviewer).revokeFeedback(agentId, BigInt(record.feedbackIndex)));
  console.log("Feedback revoked; it remains visible in history.");
} finally {
  provider.destroy();
}
