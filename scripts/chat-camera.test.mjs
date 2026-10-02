import { stillPrompt } from "../src/lib/imagine/jobs.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const back = stillPrompt({
  kind: "selfie",
  userText: "А можно сзади?",
  world: "PLACE: apartment. CLOTHES: black bicycle shorts and cropped top.",
});
console.log("back prompt", back);
assert(/FROM-BEHIND|FROM BEHIND|TURNED HER BACK|turned away/i.test(back), `rear prompt too weak: ${back}`);
assert(!/Keep the original crop/i.test(back), "must not lock the front crop");
assert(/shorts/i.test(back), "keeps clothes");

const kindBack = stillPrompt({ kind: "back", userText: "", world: "CLOTHES: shorts." });
assert(/FROM-BEHIND|turned her back/i.test(kindBack), kindBack);

const side = stillPrompt({ kind: "side", userText: "а можно боком" });
assert(/SIDE/i.test(side) && /NOT a front/i.test(side), side);

const lean = stillPrompt({
  kind: "selfie",
  userText: "Ммм, а можешь нагнуться?)",
  world: "PLACE: apartment. CLOTHES: black bicycle shorts and cropped top.",
});
assert(/FROM-BEHIND|lean/i.test(lean), lean);
assert(/SAME phone photo|re-shoot/i.test(lean), "must reuse the same shot");

console.log("ok");
