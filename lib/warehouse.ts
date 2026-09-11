export function canOperateWarehouseShipment(assignedWarehouseIds: readonly string[], shipmentWarehouseId: string | null | undefined) {
  return Boolean(shipmentWarehouseId && assignedWarehouseIds.includes(shipmentWarehouseId))
}
