import { M as MARK, s as strFromU8, z as zlibSync, a as strToU8 } from "./base-BrE4jft0.js";
const pack = (event) => {
  const _e = {
    ...event,
    v: MARK
  };
  return strFromU8(zlibSync(strToU8(JSON.stringify(_e))), true);
};
export {
  pack
};
//# sourceMappingURL=pack.js.map
