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
"use strict";var u=Object.defineProperty,a=Object.defineProperties;var b=Object.getOwnPropertyDescriptors;var s=Object.getOwnPropertySymbols;var l=Object.prototype.hasOwnProperty,y=Object.prototype.propertyIsEnumerable;var c=(e,t,r)=>t in e?u(e,t,{enumerable:!0,configurable:!0,writable:!0,value:r}):e[t]=r,n=(e,t)=>{for(var r in t||(t={}))l.call(t,r)&&c(e,r,t[r]);if(s)for(var r of s(t))y.call(t,r)&&c(e,r,t[r]);return e},i=(e,t)=>a(e,b(t));Object.defineProperty(exports,Symbol.toStringTag,{value:"Module"});const o=require("./base-B40z8PPs.cjs"),S=e=>{const t=i(n({},e),{v:o.MARK});return o.strFromU8(o.zlibSync(o.strToU8(JSON.stringify(t))),!0)};exports.pack=S;
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
//# sourceMappingURL=pack.umd.min.cjs.map
