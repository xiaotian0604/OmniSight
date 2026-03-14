(function (g, f) {
    if ("object" == typeof exports && "object" == typeof module) {
      module.exports = f();
    } else if ("function" == typeof define && define.amd) {
      define("rrwebPacker", [], f);
    } else if ("object" == typeof exports) {
      exports["rrwebPacker"] = f();
    } else {
      g["rrwebPacker"] = f();
    }
  }(this, () => {
var exports = {};
var module = { exports };
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
if (typeof module.exports == "object" && typeof exports == "object") {
  var __cp = (to, from, except, desc) => {
    if ((from && typeof from === "object") || typeof from === "function") {
      for (let key of Object.getOwnPropertyNames(from)) {
        if (!Object.prototype.hasOwnProperty.call(to, key) && key !== except)
        Object.defineProperty(to, key, {
          get: () => from[key],
          enumerable: !(desc = Object.getOwnPropertyDescriptor(from, key)) || desc.enumerable,
        });
      }
    }
    return to;
  };
  module.exports = __cp(module.exports, exports);
}
return module.exports;
}))
//# sourceMappingURL=unpack.umd.cjs.map
