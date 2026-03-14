"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertLevel = exports.AlertChannelType = void 0;
var AlertChannelType;
(function (AlertChannelType) {
    AlertChannelType["FEISHU"] = "feishu";
    AlertChannelType["DINGTALK"] = "dingtalk";
    AlertChannelType["EMAIL"] = "email";
    AlertChannelType["SLACK"] = "slack";
})(AlertChannelType || (exports.AlertChannelType = AlertChannelType = {}));
var AlertLevel;
(function (AlertLevel) {
    AlertLevel["INFO"] = "info";
    AlertLevel["WARNING"] = "warning";
    AlertLevel["ERROR"] = "error";
    AlertLevel["CRITICAL"] = "critical";
})(AlertLevel || (exports.AlertLevel = AlertLevel = {}));
//# sourceMappingURL=alert.types.js.map