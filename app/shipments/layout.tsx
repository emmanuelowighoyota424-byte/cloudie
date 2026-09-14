import { CloudieWorkspaceShell } from '@/components/cloudie-workspace-shell'
export default function ShipmentsLayout({children}:{children:React.ReactNode}){return <CloudieWorkspaceShell workspace="Shipments" links={[["Overview","/shipments"],["Create Shipment","/shipments#new"],["Customer Tracking","/customer"]]}>{children}</CloudieWorkspaceShell>}
