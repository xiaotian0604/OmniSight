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
const pack = require("./pack.cjs");
const unpack = require("./unpack.cjs");
exports.pack = pack.pack;
exports.unpack = unpack.unpack;
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
//# sourceMappingURL=packer.umd.cjs.map
