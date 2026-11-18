import { readFileSync } from "node:fs";
import { formatUnits, getAddress } from "ethers";
import { checkNetwork, provider, identity, reputation, loadAgent } from "./client.mjs";

try {
  await checkNetwork();
  const { agentId, agentRegistry } = loadAgent();
  const record = JSON.parse(readFileSync("feedback.json", "utf8"));
  if (record.agentRegistry !== agentRegistry || BigInt(record.agentId) !== agentId) {
    throw new Error("feedback.json belongs to a different agent");
  }
  const feedback = await reputation.readFeedback(agentId, record.clientAddress, BigInt(record.feedbackIndex));
  // This demo selects its own reviewer; production apps must choose reviewers they trust.
  const trustedReviewers = [...new Set([record.clientAddress].map(getAddress))];
  const summary = await reputation.getSummary(agentId, trustedReviewers, "quality", "stars-5");
  console.log("Agent:", agentRegistry, agentId.toString());
  console.log("NFT owner:", await identity.ownerOf(agentId));
  console.log("Receiving wallet:", await identity.getAgentWallet(agentId));
  console.log("Metadata URI:", await identity.tokenURI(agentId));
  console.log("Review:", formatUnits(feedback.value, feedback.valueDecimals), "out of 5");
  console.log("Revoked:", feedback.isRevoked);
  console.log("Matching review count:", summary.count.toString());
  if (summary.count > 0n) {
    console.log("Summary:", formatUnits(summary.summaryValue, summary.summaryValueDecimals), "out of 5");
  } else {
    console.log("No matching active reviews");
  }
} finally {
  provider.destroy();
}
