import { configureEffectiveRestrictionsMaterializer } from "../../application/use-cases/recompute-effective-restrictions"
import { dbEffectiveRestrictionsMaterializer } from "../materializers/recompute-effective-restrictions.db"

configureEffectiveRestrictionsMaterializer(dbEffectiveRestrictionsMaterializer)
