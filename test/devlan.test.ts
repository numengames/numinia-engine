import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore plain .mjs tool
import { lanIp } from "../tools/dev-lan.mjs";

test("lanIp: first private IPv4 that is not internal; null when none", () => {
  const nic = (address: string, internal = false, family = "IPv4") => ({ address, internal, family });
  assert.equal(lanIp({ lo: [nic("127.0.0.1", true)], eth0: [nic("fe80::1", false, "IPv6"), nic("192.168.1.20")] }), "192.168.1.20");
  assert.equal(lanIp({ a: [nic("8.8.8.8")], b: [nic("10.0.0.5")] }), "10.0.0.5");
  assert.equal(lanIp({ a: [nic("172.20.1.1")] }), "172.20.1.1");
  assert.equal(lanIp({ a: [nic("172.32.1.1")], lo: [nic("127.0.0.1", true)] }), null);
});
