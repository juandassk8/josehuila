import { createServer } from 'node:http';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { describe, it, expect, vi } from 'vitest';
import { makeCreativeMcp } from './mcp.js';

async function withMcp(scope, run) {
  const service = { catalog: vi.fn(async () => ({ company: { id: 'company-a' }, products: [] })), save: vi.fn(async () => ({ saved: true })), list: vi.fn(async () => []) };
  const host = createServer(async (req, res) => {
    const mcp = makeCreativeMcp({ company_id: 'company-a', user_id: 'user-a', scope }, service);
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    // The VPS adapter consumes JSON before invoking the MCP handler.
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    try { await mcp.connect(transport); await transport.handleRequest(req, res, parsed); }
    finally { await mcp.close(); }
  });
  await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
  const rpc = async (method, params = {}) => {
    const response = await fetch(`http://127.0.0.1:${host.address().port}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    return response.json();
  };
  try { await run(rpc, service); } finally { host.closeAllConnections(); await new Promise(resolve => host.close(resolve)); }
}
const args = { reference_id: '0b49897c-d3c2-42e9-943a-9bb4022fee22', product_id: 'product-a', title: 'Mi imagen',
  image: { download_url: 'https://files.oaiusercontent.com/image', file_id: 'file-a' } };
describe('MCP over Streamable HTTP', () => {
  it('initializes and advertises a complete ChatGPT file schema', async () => withMcp('creatives:read creatives:write', async rpc => {
    const init = await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(init.result.serverInfo.name).toBe('inforce-creativos');
    const list = await rpc('tools/list');
    expect(list.result.tools).toHaveLength(4);
    const save = list.result.tools.find(tool => tool.name === 'guardar_creativo');
    expect(save._meta['openai/fileParams']).toEqual(['image']);
    expect(Object.keys(save.inputSchema.properties.image.properties)).toEqual(['download_url', 'file_id', 'mime_type', 'file_name']);
    expect(save.inputSchema.properties.image.required).toEqual(['download_url', 'file_id']);
    expect(save.annotations.readOnlyHint).toBe(false);
  }));
  it('passes the authenticated company rather than a company chosen by the model', async () => withMcp('creatives:read', async (rpc, service) => {
    const result = await rpc('tools/call', { name: 'consultar_creativos', arguments: {} });
    expect(result.result.isError).not.toBe(true);
    expect(service.catalog.mock.calls[0][0].company_id).toBe('company-a');
    const bad = await rpc('tools/call', { name: 'consultar_creativos', arguments: { company_id: 'company-b' } });
    expect(bad.result?.isError || bad.error).toBeTruthy();
    expect(service.catalog).toHaveBeenCalledTimes(1);
  }));
  it('blocks a write through a read-only grant before invoking storage', async () => withMcp('creatives:read', async (rpc, service) => {
    const result = await rpc('tools/call', { name: 'guardar_creativo', arguments: args });
    expect(result.result.isError).toBe(true); expect(service.save).not.toHaveBeenCalled();
  }));
  it('validates files and writes through an authorized grant', async () => withMcp('creatives:read creatives:write', async (rpc, service) => {
    const invalid = await rpc('tools/call', { name: 'guardar_creativo', arguments: { ...args, image: { file_id: 'invented' } } });
    expect(invalid.result?.isError || invalid.error).toBeTruthy(); expect(service.save).not.toHaveBeenCalled();
    const valid = await rpc('tools/call', { name: 'guardar_creativo', arguments: args });
    expect(valid.result.isError).not.toBe(true); expect(service.save).toHaveBeenCalledTimes(1);
  }));
});
