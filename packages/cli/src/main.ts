#!/usr/bin/env node

import { ok } from "@skillpin/core";

const version = "0.1.0";
const startup = ok({ version });

console.log(`SkillPin ${startup.value.version} (P0 baseline)`);
