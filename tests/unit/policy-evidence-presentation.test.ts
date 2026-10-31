import { expect, it } from "vitest"
import { presentPolicyEvidence } from "@/lib/commercial-policy/evidence-presentation"
import type { CommercialPolicyDiagnosis } from "@/lib/commercial-policy/evaluate"

const diagnosis = {
	policyStatus: "unsupported",
	applicableRequirements: [{key:"guide",policyVersionId:"v1",documentAcceptance:{version:1,alternatives:[]}}],
	blockers:[{id:"requirement_guide",policyVersionId:"v1",evidenceState:"missing"}],
	evaluation:{requirements:[{key:"guide",policyVersionId:"v1",package:{subjects:[{subjectId:"private-id",satisfiedBy:null,alternatives:[{missing:["credential"]}]}]}}]},
} as unknown as CommercialPolicyDiagnosis

it("keeps confirmed requirements visible under partial coverage without exposing subject IDs", () => {
	const [view] = presentPolicyEvidence(diagnosis,[{id:"private-id",name:"Ana Pérez"}],true)
	expect(view.canUpload).toBe(true)
	expect(view.subjects[0].label).toBe("Ana Pérez")
	expect(JSON.stringify(view)).not.toContain("private-id")
})
it("does not offer uploads without permission or an identified required subject", () => {
	expect(presentPolicyEvidence(diagnosis,[],false)[0].canUpload).toBe(false)
	const empty = structuredClone(diagnosis)
	empty.evaluation!.requirements[0].package!.subjects = []
	expect(presentPolicyEvidence(empty,[],true)[0].canUpload).toBe(false)
})
