"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const base = require("./base-B40z8PPs.cjs");
const unpack = (raw) => {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    const e = JSON.parse(raw);
    if (e.timestamp) {
      return e;
    }
  } catch (error) {
  }
  try {
    const e = JSON.parse(
      base.strFromU8(base.unzlibSync(base.strToU8(raw, true)))
    );
    if (e.v === base.MARK) {
      return e;
    }
    throw new Error(
      `These events were packed with packer ${e.v} which is incompatible with current packer ${base.MARK}.`
    );
  } catch (error) {
    console.error(error);
    throw new Error("Unknown data format.");
  }
};
exports.unpack = unpack;
//# sourceMappingURL=unpack.cjs.map
