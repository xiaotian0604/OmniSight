"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayModule = void 0;
const common_1 = require("@nestjs/common");
const replay_controller_1 = require("./replay.controller");
const replay_service_1 = require("./replay.service");
let ReplayModule = class ReplayModule {
};
exports.ReplayModule = ReplayModule;
exports.ReplayModule = ReplayModule = __decorate([
    (0, common_1.Module)({
        controllers: [replay_controller_1.ReplayController],
        providers: [replay_service_1.ReplayService],
    })
], ReplayModule);
//# sourceMappingURL=replay.module.js.map