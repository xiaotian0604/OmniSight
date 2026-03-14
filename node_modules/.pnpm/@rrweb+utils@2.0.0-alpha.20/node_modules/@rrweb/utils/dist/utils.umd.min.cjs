(function (g, f) {
    if ("object" == typeof exports && "object" == typeof module) {
      module.exports = f();
    } else if ("function" == typeof define && define.amd) {
      define("rrwebUtils", [], f);
    } else if ("object" == typeof exports) {
      exports["rrwebUtils"] = f();
    } else {
      g["rrwebUtils"] = f();
    }
  }(this, () => {
var exports = {};
var module = { exports };
"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const g={Node:["childNodes","parentNode","parentElement","textContent","ownerDocument"],ShadowRoot:["host","styleSheets"],Element:["shadowRoot","querySelector","querySelectorAll"],MutationObserver:[]},b={Node:["contains","getRootNode"],ShadowRoot:["getSelection"],Element:[],MutationObserver:["constructor"]},l={},v=()=>!!globalThis.Zone;function p(t){if(l[t])return l[t];const e=globalThis[t],o=e.prototype,n=t in g?g[t]:void 0,r=!!(n&&n.every(c=>{var s,a;return!!((a=(s=Object.getOwnPropertyDescriptor(o,c))==null?void 0:s.get)!=null&&a.toString().includes("[native code]"))})),u=t in b?b[t]:void 0,d=!!(u&&u.every(c=>{var s;return typeof o[c]=="function"&&((s=o[c])==null?void 0:s.toString().includes("[native code]"))}));if(r&&d&&!v())return l[t]=e.prototype,e.prototype;try{const c=document.createElement("iframe");document.body.appendChild(c);const s=c.contentWindow;if(!s)return e.prototype;const a=s[t].prototype;return document.body.removeChild(c),a?l[t]=a:o}catch(c){return o}}const f={};function i(t,e,o){var n;const r=`${t}.${String(o)}`;if(f[r])return f[r].call(e);const u=p(t),d=(n=Object.getOwnPropertyDescriptor(u,o))==null?void 0:n.get;return d?(f[r]=d,d.call(e)):e[o]}const h={};function y(t,e,o){const n=`${t}.${String(o)}`;if(h[n])return h[n].bind(e);const u=p(t)[o];return typeof u!="function"?e[o]:(h[n]=u,u.bind(e))}function N(t){return i("Node",t,"ownerDocument")}function m(t){return i("Node",t,"childNodes")}function S(t){return i("Node",t,"parentNode")}function w(t){return i("Node",t,"parentElement")}function O(t){return i("Node",t,"textContent")}function P(t,e){return y("Node",t,"contains")(e)}function A(t){return y("Node",t,"getRootNode")()}function R(t){return!t||!("host"in t)?null:i("ShadowRoot",t,"host")}function E(t){return t.styleSheets}function M(t){return!t||!("shadowRoot"in t)?null:i("Element",t,"shadowRoot")}function _(t,e){return i("Element",t,"querySelector")(e)}function C(t,e){return i("Element",t,"querySelectorAll")(e)}function q(){return p("MutationObserver").constructor}function U(t,e,o){try{if(!(e in t))return()=>{};const n=t[e],r=o(n);return typeof r=="function"&&(r.prototype=r.prototype||{},Object.defineProperties(r,{__rrweb_original__:{enumerable:!1,value:n}})),t[e]=r,()=>{t[e]=n}}catch(n){return()=>{}}}const j={ownerDocument:N,childNodes:m,parentNode:S,parentElement:w,textContent:O,contains:P,getRootNode:A,host:R,styleSheets:E,shadowRoot:M,querySelector:_,querySelectorAll:C,mutationObserver:q,patch:U};exports.childNodes=m;exports.contains=P;exports.default=j;exports.getRootNode=A;exports.getUntaintedAccessor=i;exports.getUntaintedMethod=y;exports.getUntaintedPrototype=p;exports.host=R;exports.isAngularZonePresent=v;exports.mutationObserverCtor=q;exports.ownerDocument=N;exports.parentElement=w;exports.parentNode=S;exports.patch=U;exports.querySelector=_;exports.querySelectorAll=C;exports.shadowRoot=M;exports.styleSheets=E;exports.textContent=O;
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
//# sourceMappingURL=utils.umd.min.cjs.map
