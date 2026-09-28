import { Component, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Shell } from '@/components/layout/Shell'
import { ErrorState, ToastViewport } from '@/components/ui/primitives'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 3000, retry: 1, refetchOnWindowFocus: false } },
})

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) return <div className="p-6"><ErrorState title="页面出错" body={this.state.error.message} onRetry={() => this.setState({ error: null })} /></div>
    return this.props.children
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Boundary>
        <Shell />
      </Boundary>
      <ToastViewport />
    </QueryClientProvider>
  )
}
