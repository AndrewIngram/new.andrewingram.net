import assert from "node:assert";

export default (id) => {
  if (id === "node:asset") {
    return assert;
  }
  throw new Error(`Requiring ${JSON.stringify(id)} is not allowed.`);
};
