import { Cloud, HardDrive, Check } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ProviderDemo() {
  return (
    <Tabs defaultValue="local" className="provider-demo">
      <TabsList
        aria-label="Explore AI provider options"
        className="provider-tabs"
      >
        <TabsTrigger value="local">
          <HardDrive />
          On your machine
        </TabsTrigger>
        <TabsTrigger value="cloud">
          <Cloud />
          Cloud providers
        </TabsTrigger>
      </TabsList>
      <TabsContent value="local" className="provider-panel">
        <div className="provider-route">
          <HardDrive size={22} />
          <span>Your transcript</span>
          <span aria-hidden="true">→</span>
          <span>Your local model</span>
        </div>
        <h3>Keep AI close to home.</h3>
        <p>
          Run a suitable model with Ollama or LM Studio and point Companion at
          its local endpoint.
        </p>
        <div className="provider-names">
          <span>Ollama</span>
          <span>LM Studio</span>
          <span>Custom endpoint</span>
        </div>
        <p className="provider-detail">
          <Check size={15} />
          You manage the model, server, and hardware.
        </p>
      </TabsContent>
      <TabsContent value="cloud" className="provider-panel">
        <div className="provider-route">
          <Cloud size={22} />
          <span>Your transcript</span>
          <span aria-hidden="true">→</span>
          <span>Your chosen provider</span>
        </div>
        <h3>Bring the AI you prefer.</h3>
        <p>
          Use your API key with an implemented adapter, or configure your own
          OpenAI-compatible endpoint.
        </p>
        <div className="provider-names">
          <span>OpenAI</span>
          <span>Gemini</span>
          <span>Anthropic</span>
          <span>Azure OpenAI</span>
          <span>OpenRouter</span>
        </div>
        <p className="provider-detail">
          <Check size={15} />
          Provider billing and data policies apply.
        </p>
      </TabsContent>
    </Tabs>
  );
}
