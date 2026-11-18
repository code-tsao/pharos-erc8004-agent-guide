import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { getAddress, Interface } from "ethers";

const exampleDir = new URL("../", import.meta.url);
const repository = new URL("../../../", import.meta.url);
const source = (name) => readFileSync(new URL(name, exampleDir), "utf8");
const client = source("client.mjs");
const validationClient = source("validation-client.mjs");

test("README code blocks exactly match every runnable example file", () => {
  const readme = readFileSync(new URL("README.md", repository), "utf8");
  const blocks = [...readme.matchAll(/<!-- file: ([a-z0-9.-]+\.mjs) -->\s*```javascript\n([\s\S]*?)\n```/g)];
  const names = blocks.map(([, name]) => name);
  const files = readdirSync(exampleDir).filter((name) => name.endsWith(".mjs"));
  assert.ok(files.length > 0, "Runnable examples are missing");
  assert.equal(new Set(names).size, names.length, "Duplicate README file labels");
  assert.deepEqual(names.sort(), files.sort(), "README and runnable example files differ");
  for (const [, name, code] of blocks) {
    assert.equal(source(name), `${code}\n`, `${name} differs from its README code block`);
  }
});

test("tutorial ABI fragments agree with downloadable contract ABIs", () => {
  const groups = [
    ["identity", client.match(/export const identityAbi = \[([\s\S]*?)\];/)[1]],
    ["reputation", client.match(/export const reputationAbi = \[([\s\S]*?)\];/)[1]],
    ["validation", validationClient],
    ["identity", source("set-wallet.mjs")],
  ];
  for (const [registry, text] of groups) {
    const fragments = [...text.matchAll(/"((?:function|event) [^"\n]+)"/g)].map((match) => match[1]);
    assert.ok(fragments.length > 0, `${registry} example ABI is missing`);
    const fullAbi = JSON.parse(readFileSync(new URL(`abis/erc8004-atlantic-${registry}-abi.json`, repository), "utf8"));
    const full = new Interface(fullAbi);
    for (const fragment of new Interface(fragments).fragments) {
      const signature = fragment.format("sighash");
      const actual = fragment.type === "event" ? full.getEvent(signature) : full.getFunction(signature);
      assert.ok(actual, `${registry}: unknown ${signature}`);
      assert.deepEqual(actual.inputs.map((input) => input.format("sighash")), fragment.inputs.map((input) => input.format("sighash")), signature);
      if (fragment.type === "event") {
        assert.equal(actual.anonymous, fragment.anonymous, signature);
        assert.deepEqual(actual.inputs.map((input) => Boolean(input.indexed)), fragment.inputs.map((input) => Boolean(input.indexed)), `${signature}: indexed flags`);
        assert.deepEqual(actual.inputs.map((input) => input.name), fragment.inputs.map((input) => input.name), `${signature}: event argument names`);
      } else {
        assert.equal(actual.stateMutability, fragment.stateMutability, `${signature}: mutability`);
        assert.deepEqual(actual.outputs.map((output) => output.format("sighash")), fragment.outputs.map((output) => output.format("sighash")), `${signature}: return types`);
        assert.deepEqual(actual.outputs.map((output) => output.name), fragment.outputs.map((output) => output.name), `${signature}: return names`);
      }
    }
  }
});

test("example chain, proxy addresses, and version match public deployment metadata", () => {
  const deployment = JSON.parse(readFileSync(new URL("deployments/atlantic.json", repository), "utf8"));
  const chainId = Number(client.match(/export const CHAIN_ID = (\d+);/)[1]);
  assert.equal(chainId, deployment.chainId);
  for (const [registry, constant, text] of [
    ["identity", "IDENTITY_ADDRESS", client],
    ["reputation", "REPUTATION_ADDRESS", client],
    ["validation", "VALIDATION_ADDRESS", validationClient],
  ]) {
    const address = text.match(new RegExp(`export const ${constant} = "(0x[0-9a-fA-F]{40})";`))[1];
    assert.equal(getAddress(address), getAddress(deployment.registries[registry].address), `${registry} proxy address`);
  }
  assert.ok(client.includes('export const AGENT_REGISTRY = `eip155:${CHAIN_ID}:${IDENTITY_ADDRESS}`;'));
  assert.equal(deployment.agentRegistry, `eip155:${chainId}:${deployment.registries.identity.address}`);
  assert.equal(client.match(/process\.env\.RPC_URL \|\| "([^"]+)"/)[1], deployment.rpcUrl);
  const versionChecks = [...`${client}\n${validationClient}`.matchAll(/getVersion\(\) !== "([^"]+)"/g)];
  assert.equal(versionChecks.length, 3);
  for (const [, version] of versionChecks) assert.equal(version, deployment.version);
});
