const rp = require('../index.js')
const d3 = Object.assign({}, require('d3'), require('d3-sankey-circular'), require('d3-path-arrows'))
const D3Node = require('d3-node')
const fs = require('fs')

function generateGraphSvg(filePath, graph,
                          nodeFunc = n => ({ ...n, label: n.type, title: `${n.id} at ${n.time}`, sort: n.time }),
                          linkFunc = (rel, source, target) => ({ ...rel, value: 1, label: rel.relation, title: rel.relation })
                          ) {

  const width = 1280, height = 800, margin = { top: 30, right: 50, bottom: 30, left: 50}
  const sankey = d3
      .sankeyCircular()
      .nodeWidth(10)
      .nodePadding(20)
      //.nodePaddingRatio(0.5)
      .size([width - margin.left - margin.right, height - margin.top - margin.bottom])
      .nodeId(d => d.id)
      .nodeAlign(d3.sankeyLeft)
      .iterations(5)
      .circularLinkGap(1)
      .sortNodes("sort")

  const data = rp.graphToD3Sankey(graph, nodeFunc, linkFunc)
  //console.log("SDATA", data)
  const sankeyData = sankey(data)
  /* const sankeyData = sankey(rp.graphToD3Sankey(
       graph,
       nodeFunc = n => ({ ...n, col:depth, name: n.id, label: n.type,   }),

       linkFunc = (rel, source, target) => ({ ...rel, value: 1, label: rel.relation })
   ))*/
  const sankeyNodes = sankeyData.nodes
  const sankeyLinks = sankeyData.links
  const depthExtent = d3.extent(sankeyNodes, function (d) { return d.depth })
  const nodeColour = d3.scaleSequential(d3.interpolateCool)
      .domain([0, width])

  const d3n = new D3Node({ d3Module: d3 })
  const svg = d3n.createSVG(width, height)
  const g = svg.append("g")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
  const linkG = g.append("g")
      .attr("class", "links")
      .attr("stroke-opacity", 0.2)
      .selectAll("path")
  const nodeG = g.append("g")
      .attr("class", "nodes")
      .attr("font-family", "sans-serif")
      .attr("font-size", 10)
      .selectAll("g")
  const linkLabels = g.append("g")

  const node = nodeG.data(sankeyNodes)
      .enter()
      .append("g")

  node.append("rect")
      .attr("x", d => d.x0 )
      .attr("y", d => d.y0 )
      .attr("height", d => d.y1 - d.y0 )
      .attr("width", d => d.x1 - d.x0 )
      .style("fill", d => nodeColour(d.x0) )
      .style("opacity", 0.5)
  node.append("text")
      .attr("x", d => (d.x0 + d.x1) / 2 )
      .attr("y", d => d.y0 - 12 )
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .text( d => d.label )
  node.append("title")
      .text( d => d.title)

  const link = linkG.data(sankeyLinks)
      .enter()
      .append("g")
  link.append("path")
      .attr("fill", "none")
      .attr("class", "sankey-link")
      .attr("d", link => link.path)
      .style("stroke-width", d => Math.max(1, d.width))
      .style("opacity", 0.7)
      .style("stroke", (link, i) => link.circular ? "red" : "black")
  link.append("title")
      .text(d => d.title )
  link.append("text")
      .attr("x", d => d.source.x1 + 5)
      .attr("y", d => d.y0)
      .attr("text-anchor", "start")
      .attr("font-family", "sans-serif")
      .attr("font-size", 10)
      .attr("dy", "0.35em")
      .text(d => d.sourceLabel || d.label)
  link.append("text")
      .attr("x", d => d.target.x0 - 5)
      .attr("y", d => d.y1)
      .attr("text-anchor", "end")
      .attr("font-family", "sans-serif")
      .attr("font-size", 10)
      .attr("dy", "0.35em")
      .text(d => d.targetLabel || d.label)

 // link.each(l => console.log("L",l))

  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, d3n.svgString(), (err) => {
      if(err) return reject(err)
      resolve('ok')
    })
  })
}

module.exports = {
  generateGraphSvg
}