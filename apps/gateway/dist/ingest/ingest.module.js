"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const auth_module_1 = require("../auth/auth.module");
const ingest_controller_1 = require("./ingest.controller");
const ingest_service_1 = require("./ingest.service");
let IngestModule = class IngestModule {
};
exports.IngestModule = IngestModule;
exports.IngestModule = IngestModule = __decorate([
    (0, common_1.Module)({
        imports: [
            auth_module_1.AuthModule,
            bull_1.BullModule.registerQueue({
                name: 'ingest',
            }),
        ],
        controllers: [ingest_controller_1.IngestController],
        providers: [ingest_service_1.IngestService],
    })
], IngestModule);
//# sourceMappingURL=ingest.module.js.map