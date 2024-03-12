import React from 'react'

import {
  Footer,
  FooterProps,
  Navbar,
  NavbarProps,
} from '../../../../components'
import { About } from '../../../../components/About'
import { BridgesMvpWarning } from '../../../../components/BridgesMvpWarning'
import { SimplePageHeader } from '../../../../components/header/SimplePageHeader'
import { BridgesNavigationTabs } from '../../../../components/navigation-tabs/BridgesNavigationTabs'
import { PageContent } from '../../../../components/PageContent'
import { BridgesRiskView, BridgesRiskViewProps } from './BridgesRiskView'

export interface BridgesRiskPageProps {
  riskView: BridgesRiskViewProps
  footer: FooterProps
  navbar: NavbarProps
}

export function BridgesRiskPage(props: BridgesRiskPageProps) {
  return (
    <>
      <Navbar {...props.navbar} />
      <PageContent>
        <BridgesNavigationTabs selected="risk" />
        <main>
          <SimplePageHeader>Risk Analysis</SimplePageHeader>
          <BridgesMvpWarning />
          <BridgesRiskView {...props.riskView} />
          <About />
        </main>
      </PageContent>
      <Footer {...props.footer} />
    </>
  )
}
