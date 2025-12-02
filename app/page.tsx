'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SpeakingTab } from '@/components/speaking/SpeakingTab'
import { WritingTab } from '@/components/writing/WritingTab'
import { Header } from '@/components/shared/Header'
import { SpeakingProvider } from '@/contexts/SpeakingContext'
import { WritingProvider } from '@/contexts/WritingContext'

export default function Home() {
  const [activeTab, setActiveTab] = useState('speaking')

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="speaking">Speaking Test</TabsTrigger>
            <TabsTrigger value="writing">Writing Test</TabsTrigger>
          </TabsList>
          
          <TabsContent value="speaking" className="space-y-6">
            <SpeakingProvider>
              <SpeakingTab />
            </SpeakingProvider>
          </TabsContent>
          
          <TabsContent value="writing" className="space-y-6">
            <WritingProvider>
              <WritingTab />
            </WritingProvider>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}