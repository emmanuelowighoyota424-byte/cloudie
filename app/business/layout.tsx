import { CloudieWorkspaceShell } from '@/components/cloudie-workspace-shell'
export default function BusinessLayout({children}:{children:React.ReactNode}){return <CloudieWorkspaceShell workspace="Business Suite" links={[["Overview","/business"],["Customer Portals","/business"],["Banking","/business"],["Investments","/business"],["KYC","/kyc"]]}>{children}</CloudieWorkspaceShell>}
