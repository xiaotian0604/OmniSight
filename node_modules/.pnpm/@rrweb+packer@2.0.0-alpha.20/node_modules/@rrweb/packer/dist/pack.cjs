"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const base = require("./base-B40z8PPs.cjs");
const pack = (event) => {
  const _e = {
    ...event,
    v: base.MARK
  };
  return base.strFromU8(base.zlibSync(base.strToU8(JSON.stringify(_e))), true);
};
exports.pack = pack;
//# sourceMappingURL=pack.cjs.map
