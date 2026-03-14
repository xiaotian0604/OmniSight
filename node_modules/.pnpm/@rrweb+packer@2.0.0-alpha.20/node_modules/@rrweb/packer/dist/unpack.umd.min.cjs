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
"use strict";Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const e=require("./base-B40z8PPs.cjs"),n=t=>{if(typeof t!="string")return t;try{const r=JSON.parse(t);if(r.timestamp)return r}catch(r){}try{const r=JSON.parse(e.strFromU8(e.unzlibSync(e.strToU8(t,!0))));if(r.v===e.MARK)return r;throw new Error(`These events were packed with packer ${r.v} which is incompatible with current packer ${e.MARK}.`)}catch(r){throw console.error(r),new Error("Unknown data format.")}};exports.unpack=n;
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
//# sourceMappingURL=unpack.umd.min.cjs.map
