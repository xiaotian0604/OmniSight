import { s as strFromU8, u as unzlibSync, a as strToU8, M as MARK } from "./base-BrE4jft0.js";
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
      strFromU8(unzlibSync(strToU8(raw, true)))
    );
    if (e.v === MARK) {
      return e;
    }
    throw new Error(
      `These events were packed with packer ${e.v} which is incompatible with current packer ${MARK}.`
    );
  } catch (error) {
    console.error(error);
    throw new Error("Unknown data format.");
  }
};
export {
  unpack
};
//# sourceMappingURL=unpack.js.map
