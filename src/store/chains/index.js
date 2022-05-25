/*
 * @Description: file
 * @Autor: dingyiming
 * @Date: 2021-11-20 15:26:27
 * @LastEditors: dingyiming
 * @LastEditTime: 2021-11-20 15:33:07
 */
import { isTestnet } from '@/libs/utils'
import { sha256 } from '@cosmjs/crypto'
import { toHex } from '@cosmjs/encoding'

let chains = {}

let configs = require.context('../../chains/mainnet', false, /\.json$/)
if (isTestnet()) {
  configs = require.context('../../chains/testnet', false, /\.json$/)
}

const update = {}
configs.keys().forEach(k => {
  const c = configs(k)
  update[c.chain_name] = c
})

chains = update
localStorage.setItem('chains', JSON.stringify(update))
const selected = chains.cosmos

const avatarcache = localStorage.getItem('avatars')

export default {
  namespaced: true,
  state: {
    config: chains,
    selected,
    avatars: avatarcache ? JSON.parse(avatarcache) : {},
    height: 0,
    ibcChannels: {},
    quotes: {},
    defaultWallet: localStorage.getItem('default-wallet'),
    denoms: {},
    ibcPaths: {},
  },
  getters: {
    getchains: state => state.chains,
    getAvatarById: state => id => state.avatars[id],
  },
  mutations: {
    setup_sdk_version(state, info) {
      state.chains.config[info.chain_name].sdk_version = info.version
    },
    select(state, args) {
      state.chains.selected = state.chains.config[args.chain_name]
    },
    cacheAvatar(state, args) {
      state.chains.avatars[args.identity] = args.url
      localStorage.setItem('avatars', JSON.stringify(state.chains.avatars))
    },
    setHeight(state, height) {
      state.chains.height = height
    },
    setChannels(state, { chain, channels }) {
      state.chains.ibcChannels[chain] = channels
    },
    setQuotes(state, quotes) {
      state.quotes = quotes
    },
    setDefaultWallet(state, defaultWallet) {
      if (defaultWallet && defaultWallet.length > 0) {
        localStorage.setItem('default-wallet', defaultWallet)
        state.chains.defaultWallet = defaultWallet
      }
    },
    setIBCDenoms(state, denoms) {
      state.denoms = { ...state.denoms, ...denoms }
    },
    setIBCPaths(state, paths) {
      state.ibcPaths = paths
    },
    setDenomsMetadata(state, { chainName, updatedAssets }) {
      state.config[chainName].assets = updatedAssets
      localStorage.setItem('chains', JSON.stringify(state.config))
    },
  },
  actions: {
    async getQuotes(context) {
      fetch('https://price.ping.pub/quotes').then(data => data.json()).then(data => {
        context.commit('setQuotes', data)
      })
    },

    async getAllIBCDenoms(context, _this) {
      _this.$http.getAllIBCDenoms().then(x => {
        const denomsMap = {}
        const pathsMap = {}
        x.denom_traces.forEach(trace => {
          const hash = toHex(sha256(new TextEncoder().encode(`${trace.path}/${trace.base_denom}`)))
          const ibcDenom = `ibc/${hash.toUpperCase()}`
          denomsMap[ibcDenom] = trace.base_denom

          const path = trace.path.split('/')
          if (path.length >= 2) {
            pathsMap[ibcDenom] = {
              channel_id: path[path.length - 1],
              port_id: path[path.length - 2],
            }
          }
        })
        context.commit('setIBCDenoms', denomsMap)
        context.commit('setIBCPaths', pathsMap)
      })
    },

    async getAllDenomsMetadata(context, { _this, chainName }) {
      const metadatas = await _this.$http.getAllDenomsMetadata(chains[chainName])
      const assets = metadatas.map(metadata => {
        const base = metadata.base ? metadata.base : metadata.denom_units.find(denomUnit => denomUnit.exponent === 0).denom
        const display = metadata.display ? metadata.display : metadata.denom_units.reduce((previousDenomUnit, currentDenomUnit) => (previousDenomUnit.exponent > currentDenomUnit ? previousDenomUnit : currentDenomUnit)).denom
        const exponent = metadata.denom_units.find(denomUnit => denomUnit.denom.toLowerCase() === display.toLowerCase()).exponent.toString()
        const symbol = metadata.symbol ? metadata.symbol : display

        return {
          base, symbol, exponent, coingecko_id: '', logo: '',
        }
      })
      const currentChainName = chainName || (await _this.$http.getSelectedConfig()).chain_name
      const filterAssets = assets.filter(asset => {
        let exist = false
        chains[currentChainName].assets.forEach(temp => {
          if (temp.base.toLowerCase() === asset.base.toLowerCase() || temp.symbol.toLowerCase() === asset.symbol.toLowerCase()) {
            exist = true
          }
        })
        return !exist
      })
      const updatedAssets = [...chains[currentChainName].assets, ...filterAssets]
      context.commit('setDenomsMetadata', { chainName: currentChainName, updatedAssets })
    },
  },
}
