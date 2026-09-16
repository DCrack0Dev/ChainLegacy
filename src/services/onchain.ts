import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

/**
 * On-Chain Activity Service (Web3 Enhancement)
 * Monitors wallet activity to reset inactivity timers.
 */
export class OnChainService {
  private static client = createPublicClient({
    chain: mainnet,
    transport: http(process.env.RPC_URL || 'https://cloudflare-eth.com'),
  });

  /**
   * Detects recent wallet activity (transactions).
   * Returns true if a transaction occurred after the threshold date.
   */
  static async checkRecentActivity(address: string, thresholdDate: Date): Promise<boolean> {
    try {
      // Get the latest block number
      const blockNumber = await this.client.getBlockNumber();
      
      // In a real production app, we would use a specialized indexer (Etherscan, Alchemy, Moralis)
      // to get the last transaction date. For this implementation, we check the latest block
      // as a signal or use an external API.
      
      // Simulation: Fetching last transaction for demo purposes
      // Replace with Alchemy/Etherscan API in production
      const res = await fetch(`https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=1&sort=desc&apikey=${process.env.ETHERSCAN_API_KEY}`);
      const data = await res.json();

      if (data.status === '1' && data.result.length > 0) {
        const lastTxTimestamp = parseInt(data.result[0].timeStamp) * 1000;
        return lastTxTimestamp > thresholdDate.getTime();
      }

      return false;
    } catch (error) {
      console.error('[OnChainService] Error:', error);
      return false; // Fallback to false on failure
    }
  }
}
